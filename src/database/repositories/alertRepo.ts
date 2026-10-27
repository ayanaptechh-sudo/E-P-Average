/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query, transaction } from '../db';
import {
  Alert,
  AlertStatus,
  Incident,
  IncidentPriority,
  IncidentStatus,
  IncidentTimeline,
  RiskScore,
  TimelineEventType,
} from '../types';
import { generateUUID } from '../../security/crypto';

export const alertRepo = {
  async create(alert: Omit<Alert, 'alert_id' | 'created_at' | 'resolved_at'>): Promise<Alert> {
    const alert_id = generateUUID();
    const created_at = new Date().toISOString();
    await execute(
      `INSERT INTO alerts (alert_id, finding_id, user_id, severity, title, description, assigned_to, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        alert_id,
        alert.finding_id,
        alert.user_id,
        alert.severity,
        alert.title,
        alert.description,
        alert.assigned_to,
        alert.status,
        created_at,
        null,
      ]
    );

    return {
      alert_id,
      ...alert,
      created_at,
      resolved_at: null,
    };
  },

  getAll(filters: { status?: AlertStatus; severity?: string; userId?: string } = {}): (Alert & { username?: string })[] {
    let sql = `
      SELECT a.*, COALESCE(u.username, a.user_id) as username
      FROM alerts a
      LEFT JOIN app_users u ON a.user_id = u.user_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    if (filters.status) {
      sql += ' AND a.status = ?';
      params.push(filters.status);
    }
    if (filters.severity) {
      sql += ' AND a.severity = ?';
      params.push(filters.severity);
    }
    if (filters.userId) {
      sql += ' AND a.user_id = ?';
      params.push(filters.userId);
    }
    sql += ' ORDER BY a.created_at DESC';
    return query<Alert & { username?: string }>(sql, params);
  },

  getById(alertId: string): (Alert & { username?: string }) | null {
    const rows = query<Alert & { username?: string }>(
      `SELECT a.*, COALESCE(u.username, a.user_id) as username
       FROM alerts a
       LEFT JOIN app_users u ON a.user_id = u.user_id
       WHERE a.alert_id = ?`,
      [alertId]
    );
    return rows[0] || null;
  },

  async updateStatus(alertId: string, status: AlertStatus, assignedTo?: string | null): Promise<void> {
    const resolved_at = status === 'Resolved' || status === 'Closed' ? new Date().toISOString() : null;
    if (assignedTo !== undefined) {
      await execute('UPDATE alerts SET status = ?, assigned_to = ?, resolved_at = ? WHERE alert_id = ?', [
        status,
        assignedTo,
        resolved_at,
        alertId,
      ]);
    } else {
      await execute('UPDATE alerts SET status = ?, resolved_at = ? WHERE alert_id = ?', [
        status,
        resolved_at,
        alertId,
      ]);
    }
  },

  async updateDetails(alertId: string, title: string, description: string): Promise<void> {
    await execute('UPDATE alerts SET title = ?, description = ? WHERE alert_id = ?', [
      title,
      description,
      alertId,
    ]);
  },

  countOpen(): number {
    const res = query<{ count: number }>("SELECT count(*) as count FROM alerts WHERE status IN ('Open', 'Acknowledged', 'Investigating')");
    return res[0]?.count || 0;
  },

  async purgeOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const count = query<{ count: number }>('SELECT count(*) as count FROM alerts WHERE created_at < ?', [cutoff])[0]?.count || 0;
    if (count > 0) {
      await execute('DELETE FROM alerts WHERE created_at < ?', [cutoff]);
    }
    return count;
  },
};

export const incidentRepo = {
  async getNextIncidentNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const rows = query<{ incident_number: string }>(
      'SELECT incident_number FROM incidents WHERE incident_number LIKE ? ORDER BY incident_number DESC LIMIT 1',
      [`${prefix}%`]
    );
    if (rows.length === 0) {
      return `${prefix}0001`;
    }
    const lastNumStr = rows[0].incident_number.replace(prefix, '');
    const nextNum = (parseInt(lastNumStr, 10) || 0) + 1;
    return `${prefix}${nextNum.toString().padStart(4, '0')}`;
  },

  async create(incident: {
    title: string;
    user_id: string;
    priority: IncidentPriority;
    status: IncidentStatus;
    assigned_to: string | null;
    summary: string;
    opened_by: string;
  }): Promise<Incident> {
    const incident_id = generateUUID();
    const incident_number = await this.getNextIncidentNumber();
    const opened_at = new Date().toISOString();

    await transaction(async () => {
      await execute(
        `INSERT INTO incidents (incident_id, incident_number, title, user_id, priority, status, assigned_to, summary, opened_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          incident_id,
          incident_number,
          incident.title,
          incident.user_id,
          incident.priority,
          incident.status,
          incident.assigned_to,
          incident.summary,
          opened_at,
          null,
        ]
      );

      // Create initial timeline item
      const timeline_id = generateUUID();
      await execute(
        `INSERT INTO incident_timeline (timeline_id, incident_id, event_type, source_record_id, event_time, description, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          timeline_id,
          incident_id,
          'Review',
          null,
          opened_at,
          `Incident opened with priority ${incident.priority}. Initial summary: ${incident.summary.slice(0, 100)}`,
          incident.opened_by,
        ]
      );
    });

    return {
      incident_id,
      incident_number,
      title: incident.title,
      user_id: incident.user_id,
      priority: incident.priority,
      status: incident.status,
      assigned_to: incident.assigned_to,
      summary: incident.summary,
      opened_at,
      closed_at: null,
    };
  },

  getAll(): (Incident & { username?: string; assigned_name?: string })[] {
    const sql = `
      SELECT inc.*, 
        COALESCE(u.username, inc.user_id) as username,
        COALESCE(au.username, inc.assigned_to) as assigned_name
      FROM incidents inc
      LEFT JOIN app_users u ON inc.user_id = u.user_id
      LEFT JOIN app_users au ON inc.assigned_to = au.user_id
      ORDER BY inc.opened_at DESC
    `;
    return query<Incident & { username?: string; assigned_name?: string }>(sql);
  },

  getById(incidentId: string): (Incident & { username?: string; assigned_name?: string }) | null {
    const rows = query<Incident & { username?: string; assigned_name?: string }>(
      `SELECT inc.*, 
        COALESCE(u.username, inc.user_id) as username,
        COALESCE(au.username, inc.assigned_to) as assigned_name
      FROM incidents inc
      LEFT JOIN app_users u ON inc.user_id = u.user_id
      LEFT JOIN app_users au ON inc.assigned_to = au.user_id
      WHERE inc.incident_id = ?`,
      [incidentId]
    );
    return rows[0] || null;
  },

  async update(
    incidentId: string,
    updates: {
      status?: IncidentStatus;
      priority?: IncidentPriority;
      assigned_to?: string | null;
      summary?: string;
    },
    updatedBy: string
  ): Promise<void> {
    const current = this.getById(incidentId);
    if (!current) throw new Error('Incident not found');

    const status = updates.status ?? current.status;
    const priority = updates.priority ?? current.priority;
    const assigned_to = updates.assigned_to !== undefined ? updates.assigned_to : current.assigned_to;
    const summary = updates.summary ?? current.summary;
    const closed_at = status === 'Closed' ? new Date().toISOString() : null;

    await transaction(async () => {
      await execute(
        'UPDATE incidents SET status = ?, priority = ?, assigned_to = ?, summary = ?, closed_at = ? WHERE incident_id = ?',
        [status, priority, assigned_to, summary, closed_at, incidentId]
      );

      const timeline_id = generateUUID();
      const now = new Date().toISOString();
      await execute(
        `INSERT INTO incident_timeline (timeline_id, incident_id, event_type, source_record_id, event_time, description, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          timeline_id,
          incidentId,
          'Review',
          null,
          now,
          `Incident status changed to ${status}, priority: ${priority}`,
          updatedBy,
        ]
      );
    });
  },

  async addTimelineEvent(event: {
    incident_id: string;
    event_type: TimelineEventType;
    source_record_id?: string | null;
    description: string;
    recorded_by: string;
  }): Promise<IncidentTimeline> {
    const timeline_id = generateUUID();
    const event_time = new Date().toISOString();
    await execute(
      `INSERT INTO incident_timeline (timeline_id, incident_id, event_type, source_record_id, event_time, description, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        timeline_id,
        event.incident_id,
        event.event_type,
        event.source_record_id || null,
        event_time,
        event.description,
        event.recorded_by,
      ]
    );

    return {
      timeline_id,
      incident_id: event.incident_id,
      event_type: event.event_type,
      source_record_id: event.source_record_id || null,
      event_time,
      description: event.description,
      recorded_by: event.recorded_by,
    };
  },

  getTimeline(incidentId: string): IncidentTimeline[] {
    return query<IncidentTimeline>(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY event_time ASC',
      [incidentId]
    );
  },

  countOpen(): number {
    const res = query<{ count: number }>("SELECT count(*) as count FROM incidents WHERE status != 'Closed'");
    return res[0]?.count || 0;
  },
};

export const riskRepo = {
  async saveRiskScore(score: Omit<RiskScore, 'risk_score_id'>): Promise<RiskScore> {
    const risk_score_id = generateUUID();
    await execute(
      `INSERT INTO risk_scores (risk_score_id, user_id, department, score, risk_level, scoring_window, explanation, calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        risk_score_id,
        score.user_id,
        score.department,
        score.score,
        score.risk_level,
        score.scoring_window,
        score.explanation,
        score.calculated_at,
      ]
    );

    return {
      risk_score_id,
      ...score,
    };
  },

  getLatestDepartmentScores(): RiskScore[] {
    return query<RiskScore>(`
      SELECT r1.*
      FROM risk_scores r1
      JOIN (
        SELECT department, MAX(calculated_at) as max_calc
        FROM risk_scores
        WHERE department IS NOT NULL
        GROUP BY department
      ) r2 ON r1.department = r2.department AND r1.calculated_at = r2.max_calc
      ORDER BY r1.score DESC
    `);
  },

  getRecentScores(limit = 100): RiskScore[] {
    return query<RiskScore>('SELECT * FROM risk_scores ORDER BY calculated_at DESC LIMIT ?', [limit]);
  },
};
