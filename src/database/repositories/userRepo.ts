/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query } from '../db';
import { AppUser, AuditLog, UserRole, UserStatus } from '../types';
import { generateUUID } from '../../security/crypto';

export const userRepo = {
  getByUsername(username: string): AppUser | null {
    const rows = query<AppUser>('SELECT * FROM app_users WHERE username = ? COLLATE NOCASE', [username]);
    return rows[0] || null;
  },

  getById(userId: string): AppUser | null {
    const rows = query<AppUser>('SELECT * FROM app_users WHERE user_id = ?', [userId]);
    return rows[0] || null;
  },

  getAll(): AppUser[] {
    return query<AppUser>('SELECT * FROM app_users ORDER BY username ASC');
  },

  count(): number {
    const res = query<{ count: number }>('SELECT count(*) as count FROM app_users');
    return res[0]?.count || 0;
  },

  async create(user: {
    username: string;
    password_hash: string;
    salt: string;
    role: UserRole;
    department: string;
    status: UserStatus;
  }): Promise<AppUser> {
    const user_id = generateUUID();
    const created_at = new Date().toISOString();
    await execute(
      `INSERT INTO app_users (user_id, username, password_hash, salt, role, department, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        user.username.trim(),
        user.password_hash,
        user.salt,
        user.role,
        user.department.trim(),
        user.status,
        created_at,
      ]
    );
    return {
      user_id,
      username: user.username.trim(),
      password_hash: user.password_hash,
      salt: user.salt,
      role: user.role,
      department: user.department.trim(),
      status: user.status,
      created_at,
    };
  },

  async updateRoleAndStatus(
    userId: string,
    role: UserRole,
    status: UserStatus,
    department: string
  ): Promise<void> {
    await execute(
      'UPDATE app_users SET role = ?, status = ?, department = ? WHERE user_id = ?',
      [role, status, department.trim(), userId]
    );
  },

  async resetPassword(userId: string, password_hash: string, salt: string): Promise<void> {
    await execute(
      'UPDATE app_users SET password_hash = ?, salt = ? WHERE user_id = ?',
      [password_hash, salt, userId]
    );
  },

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await execute('UPDATE app_users SET status = ? WHERE user_id = ?', [status, userId]);
  },

  async insertOrReplace(user: AppUser): Promise<void> {
    await execute(
      `INSERT OR REPLACE INTO app_users (user_id, username, password_hash, salt, role, department, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.user_id,
        user.username.trim(),
        user.password_hash,
        user.salt,
        user.role,
        user.department.trim(),
        user.status,
        user.created_at || new Date().toISOString(),
      ]
    );
  },

  async delete(userId: string): Promise<void> {
    await execute('DELETE FROM app_users WHERE user_id = ?', [userId]);
  },
};

export const auditRepo = {
  async log(entry: {
    user_id: string;
    action: string;
    target_type: string;
    target_id?: string | null;
    outcome: 'Success' | 'Failure' | 'Blocked';
    details: string; // Metadata only! Never secrets.
  }): Promise<AuditLog> {
    const audit_log_id = generateUUID();
    const timestamp = new Date().toISOString();
    const record: AuditLog = {
      audit_log_id,
      user_id: entry.user_id,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id || null,
      outcome: entry.outcome,
      timestamp,
      details: entry.details,
    };

    await execute(
      `INSERT INTO audit_logs (audit_log_id, user_id, action, target_type, target_id, outcome, timestamp, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.audit_log_id,
        record.user_id,
        record.action,
        record.target_type,
        record.target_id,
        record.outcome,
        record.timestamp,
        record.details,
      ]
    );
    return record;
  },

  getAll(limit = 500, offset = 0): AuditLog[] {
    return query<AuditLog>(
      'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  },

  count(): number {
    const res = query<{ count: number }>('SELECT count(*) as count FROM audit_logs');
    return res[0]?.count || 0;
  },

  async purgeOlderThanDays(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const beforeCount = query<{ count: number }>('SELECT count(*) as count FROM audit_logs WHERE timestamp < ?', [cutoff])[0]?.count || 0;
    if (beforeCount > 0) {
      await execute('DELETE FROM audit_logs WHERE timestamp < ?', [cutoff]);
    }
    return beforeCount;
  },
};
