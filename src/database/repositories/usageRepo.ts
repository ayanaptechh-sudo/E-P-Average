/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query, transaction } from '../db';
import { UsageEvent, UsageEventType, DetectionSource, CollectionStatus, ToolApprovalStatus } from '../types';
import { generateUUID } from '../../security/crypto';

export interface UsageFilter {
  toolId?: string;
  userId?: string;
  eventType?: UsageEventType;
  detectionSource?: DetectionSource;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export const usageRepo = {
  async create(event: Omit<UsageEvent, 'usage_event_id'>): Promise<UsageEvent> {
    const usage_event_id = generateUUID();
    await execute(
      `INSERT INTO usage_events (
        usage_event_id, user_id, tool_id, device_identifier, event_type,
        event_time, detection_source, confidence, collection_status, approval_status_at_detection
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usage_event_id,
        event.user_id,
        event.tool_id,
        event.device_identifier,
        event.event_type,
        event.event_time,
        event.detection_source,
        event.confidence,
        event.collection_status,
        event.approval_status_at_detection,
      ]
    );

    return {
      usage_event_id,
      ...event,
    };
  },

  /**
   * Check if an identical event already exists to prevent duplicate ingestion:
   * Same tool_id, same detection_source, and same event_time (within 60 seconds)
   */
  existsDuplicate(toolId: string, source: DetectionSource, eventTime: string): boolean {
    const rows = query<{ count: number }>(
      `SELECT count(*) as count FROM usage_events
       WHERE tool_id = ? AND detection_source = ? AND abs(strftime('%s', event_time) - strftime('%s', ?)) < 60`,
      [toolId, source, eventTime]
    );
    return (rows[0]?.count || 0) > 0;
  },

  async batchInsert(
    events: Omit<UsageEvent, 'usage_event_id'>[]
  ): Promise<{ inserted: number; duplicatesSkipped: number }> {
    let inserted = 0;
    let duplicatesSkipped = 0;

    await transaction(async () => {
      for (const ev of events) {
        if (this.existsDuplicate(ev.tool_id, ev.detection_source, ev.event_time)) {
          duplicatesSkipped++;
          continue;
        }

        const usage_event_id = generateUUID();
        await execute(
          `INSERT INTO usage_events (
            usage_event_id, user_id, tool_id, device_identifier, event_type,
            event_time, detection_source, confidence, collection_status, approval_status_at_detection
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            usage_event_id,
            ev.user_id,
            ev.tool_id,
            ev.device_identifier,
            ev.event_type,
            ev.event_time,
            ev.detection_source,
            ev.confidence,
            ev.collection_status,
            ev.approval_status_at_detection,
          ]
        );
        inserted++;
      }
    });

    return { inserted, duplicatesSkipped };
  },

  getAll(filter: UsageFilter = {}): (UsageEvent & { tool_name: string; username: string })[] {
    let sql = `
      SELECT u.*, t.tool_name, COALESCE(usr.username, u.user_id) as username
      FROM usage_events u
      JOIN ai_tools t ON u.tool_id = t.tool_id
      LEFT JOIN app_users usr ON u.user_id = usr.user_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filter.toolId) {
      sql += ' AND u.tool_id = ?';
      params.push(filter.toolId);
    }
    if (filter.userId) {
      sql += ' AND u.user_id = ?';
      params.push(filter.userId);
    }
    if (filter.eventType) {
      sql += ' AND u.event_type = ?';
      params.push(filter.eventType);
    }
    if (filter.detectionSource) {
      sql += ' AND u.detection_source = ?';
      params.push(filter.detectionSource);
    }
    if (filter.startDate) {
      sql += ' AND u.event_time >= ?';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      sql += ' AND u.event_time <= ?';
      params.push(filter.endDate);
    }

    sql += ' ORDER BY u.event_time DESC';

    if (filter.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
      if (filter.offset) {
        sql += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    return query<UsageEvent & { tool_name: string; username: string }>(sql, params);
  },

  count(filter: UsageFilter = {}): number {
    let sql = 'SELECT count(*) as count FROM usage_events WHERE 1=1';
    const params: (string | number)[] = [];
    if (filter.toolId) {
      sql += ' AND tool_id = ?';
      params.push(filter.toolId);
    }
    if (filter.startDate) {
      sql += ' AND event_time >= ?';
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      sql += ' AND event_time <= ?';
      params.push(filter.endDate);
    }
    const res = query<{ count: number }>(sql, params);
    return res[0]?.count || 0;
  },

  async purgeOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const beforeCount = query<{ count: number }>('SELECT count(*) as count FROM usage_events WHERE event_time < ?', [cutoff])[0]?.count || 0;
    if (beforeCount > 0) {
      await execute('DELETE FROM usage_events WHERE event_time < ?', [cutoff]);
    }
    return beforeCount;
  },
};
