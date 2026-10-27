/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query } from '../db';
import { ReportRecord, ReportType, AppSetting } from '../types';
import { generateUUID } from '../../security/crypto';

export const reportRepo = {
  async record(report: {
    incident_id?: string | null;
    report_type: ReportType;
    file_name: string;
    generated_by: string;
    sha256_hash: string;
  }): Promise<ReportRecord> {
    const report_id = generateUUID();
    const generated_at = new Date().toISOString();
    await execute(
      `INSERT INTO reports (report_id, incident_id, report_type, file_name, generated_by, generated_at, sha256_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        report_id,
        report.incident_id || null,
        report.report_type,
        report.file_name,
        report.generated_by,
        generated_at,
        report.sha256_hash,
      ]
    );

    return {
      report_id,
      incident_id: report.incident_id || null,
      report_type: report.report_type,
      file_name: report.file_name,
      generated_by: report.generated_by,
      generated_at,
      sha256_hash: report.sha256_hash,
    };
  },

  getAll(): ReportRecord[] {
    return query<ReportRecord>('SELECT * FROM reports ORDER BY generated_at DESC');
  },

  getById(reportId: string): ReportRecord | null {
    const rows = query<ReportRecord>('SELECT * FROM reports WHERE report_id = ?', [reportId]);
    return rows[0] || null;
  },

  async purgeOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const count = query<{ count: number }>('SELECT count(*) as count FROM reports WHERE generated_at < ?', [cutoff])[0]?.count || 0;
    if (count > 0) {
      await execute('DELETE FROM reports WHERE generated_at < ?', [cutoff]);
    }
    return count;
  },
};

export const settingsRepo = {
  get(key: string, defaultValue = ''): string {
    const rows = query<AppSetting>('SELECT * FROM settings WHERE key = ?', [key]);
    return rows[0] ? rows[0].value : defaultValue;
  },

  getAll(): Record<string, string> {
    const rows = query<AppSetting>('SELECT * FROM settings');
    const res: Record<string, string> = {};
    for (const r of rows) {
      res[r.key] = r.value;
    }
    return res;
  },

  async set(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now]
    );
  },

  async seedDefaults(): Promise<void> {
    const defaults: Record<string, string> = {
      session_timeout_minutes: '30',
      custom_id_regex: '',
      organization_name: 'PromptShield Enterprise',
      default_department: 'Engineering',
      browser_integration_status: 'Not configured / unsupported',
    };

    for (const [k, v] of Object.entries(defaults)) {
      const existing = this.get(k);
      if (!existing) {
        await this.set(k, v);
      }
    }
  },
};
