/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query, transaction } from '../db';
import {
  ScanSession,
  Finding,
  RedactionEvent,
  FindingStatus,
  FindingActionTaken,
  SeverityLevel,
} from '../types';
import { generateUUID } from '../../security/crypto';

export interface FindingFilter {
  category?: string;
  severity?: SeverityLevel;
  status?: FindingStatus;
  toolId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export const scanRepo = {
  async recordScanSession(session: Omit<ScanSession, 'scan_id'>): Promise<ScanSession> {
    const scan_id = generateUUID();
    await execute(
      `INSERT INTO scan_sessions (
        scan_id, user_id, tool_id, scan_time, scan_source,
        detected_count, categories_json, highest_risk, scan_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scan_id,
        session.user_id,
        session.tool_id,
        session.scan_time,
        session.scan_source,
        session.detected_count,
        session.categories_json,
        session.highest_risk,
        session.scan_status,
      ]
    );

    return {
      scan_id,
      ...session,
    };
  },

  async recordFindings(
    findings: Omit<Finding, 'finding_id'>[]
  ): Promise<Finding[]> {
    const created: Finding[] = [];
    await transaction(async () => {
      for (const f of findings) {
        const finding_id = generateUUID();
        await execute(
          `INSERT INTO findings (
            finding_id, scan_id, usage_event_id, user_id, tool_id,
            category, match_count, rule_id, severity, explanation,
            false_positive_note, created_at, status, action_taken, policy_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            finding_id,
            f.scan_id,
            f.usage_event_id,
            f.user_id,
            f.tool_id,
            f.category,
            f.match_count,
            f.rule_id,
            f.severity,
            f.explanation,
            f.false_positive_note || '',
            f.created_at,
            f.status,
            f.action_taken,
            f.policy_version,
          ]
        );
        created.push({
          finding_id,
          ...f,
        });
      }
    });

    return created;
  },

  async recordRedactionEvent(event: Omit<RedactionEvent, 'redaction_event_id'>): Promise<RedactionEvent> {
    const redaction_event_id = generateUUID();
    await execute(
      `INSERT INTO redaction_events (
        redaction_event_id, scan_id, redaction_count, categories_json,
        action_time, action_status
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        redaction_event_id,
        event.scan_id,
        event.redaction_count,
        event.categories_json,
        event.action_time,
        event.action_status,
      ]
    );

    return {
      redaction_event_id,
      ...event,
    };
  },

  getFindings(filter: FindingFilter = {}): (Finding & { tool_name?: string; username?: string })[] {
    let sql = `
      SELECT f.*, t.tool_name, COALESCE(usr.username, f.user_id) as username
      FROM findings f
      LEFT JOIN ai_tools t ON f.tool_id = t.tool_id
      LEFT JOIN app_users usr ON f.user_id = usr.user_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filter.category) {
      sql += ' AND f.category = ?';
      params.push(filter.category);
    }
    if (filter.severity) {
      sql += ' AND f.severity = ?';
      params.push(filter.severity);
    }
    if (filter.status) {
      sql += ' AND f.status = ?';
      params.push(filter.status);
    }
    if (filter.toolId) {
      sql += ' AND f.tool_id = ?';
      params.push(filter.toolId);
    }
    if (filter.userId) {
      sql += ' AND f.user_id = ?';
      params.push(filter.userId);
    }
    if (filter.startDate) {
      sql += ' AND f.created_at >= ?';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      sql += ' AND f.created_at <= ?';
      params.push(filter.endDate);
    }

    sql += ' ORDER BY f.created_at DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    return query<Finding & { tool_name?: string; username?: string }>(sql, params);
  },

  getFindingById(findingId: string): (Finding & { tool_name?: string; username?: string }) | null {
    const rows = query<Finding & { tool_name?: string; username?: string }>(
      `SELECT f.*, t.tool_name, COALESCE(usr.username, f.user_id) as username
       FROM findings f
       LEFT JOIN ai_tools t ON f.tool_id = t.tool_id
       LEFT JOIN app_users usr ON f.user_id = usr.user_id
       WHERE f.finding_id = ?`,
      [findingId]
    );
    return rows[0] || null;
  },

  async updateFindingStatus(
    findingId: string,
    status: FindingStatus,
    actionTaken?: FindingActionTaken
  ): Promise<void> {
    if (actionTaken) {
      await execute('UPDATE findings SET status = ?, action_taken = ? WHERE finding_id = ?', [
        status,
        actionTaken,
        findingId,
      ]);
    } else {
      await execute('UPDATE findings SET status = ? WHERE finding_id = ?', [status, findingId]);
    }
  },

  countFindings(filter: FindingFilter = {}): number {
    let sql = 'SELECT count(*) as count FROM findings WHERE 1=1';
    const params: (string | number)[] = [];
    if (filter.severity) {
      sql += ' AND severity = ?';
      params.push(filter.severity);
    }
    if (filter.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter.startDate) {
      sql += ' AND created_at >= ?';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      sql += ' AND created_at <= ?';
      params.push(filter.endDate);
    }
    const res = query<{ count: number }>(sql, params);
    return res[0]?.count || 0;
  },

  getScanSessions(limit = 100): ScanSession[] {
    return query<ScanSession>('SELECT * FROM scan_sessions ORDER BY scan_time DESC LIMIT ?', [limit]);
  },

  async purgeOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const count = query<{ count: number }>('SELECT count(*) as count FROM scan_sessions WHERE scan_time < ?', [cutoff])[0]?.count || 0;
    if (count > 0) {
      // Cascades to findings and redaction_events
      await execute('DELETE FROM scan_sessions WHERE scan_time < ?', [cutoff]);
    }
    return count;
  },
};
