/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppUser, UserRole, UserStatus } from '../database/types';
import { userRepo, auditRepo } from '../database/repositories/userRepo';
import { toolRepo } from '../database/repositories/toolRepo';
import { policyRepo } from '../database/repositories/policyRepo';
import { settingsRepo } from '../database/repositories/reportRepo';
import { generateSalt, hashPassword, verifyPassword } from '../security/crypto';

// In-memory lockout tracking
interface FailedAttemptTracker {
  count: number;
  lockoutUntil: number; // timestamp ms
}
const failedAttempts = new Map<string, FailedAttemptTracker>();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export type PageId =
  | 'dashboard'
  | 'inventory'
  | 'scan-text'
  | 'scan-clipboard'
  | 'redaction-preview'
  | 'findings'
  | 'risk'
  | 'alerts'
  | 'incidents'
  | 'policies'
  | 'reports'
  | 'users'
  | 'settings';

export const ROLE_PERMISSIONS: Record<UserRole, PageId[]> = {
  Administrator: [
    'dashboard',
    'inventory',
    'scan-text',
    'scan-clipboard',
    'redaction-preview',
    'findings',
    'risk',
    'alerts',
    'incidents',
    'policies',
    'reports',
    'users',
    'settings',
  ],
  Analyst: [
    'dashboard',
    'inventory',
    'scan-text',
    'scan-clipboard',
    'redaction-preview',
    'findings',
    'risk',
    'alerts',
    'incidents',
    'reports',
  ],
  Manager: [
    'dashboard', // aggregate department summaries only, no individual sensitive records
  ],
  Auditor: [
    'incidents',
    'reports',
    'settings', // read-only audit logs in settings
  ],
  'End User': [
    'scan-text',
    'scan-clipboard',
    'redaction-preview',
  ],
};

export const authService = {
  /**
   * Check if user has permission to view a specific page
   */
  hasPermission(role: UserRole, page: PageId): boolean {
    const allowed = ROLE_PERMISSIONS[role] || [];
    return allowed.includes(page);
  },

  /**
   * Check if initial system setup is required (no users exist yet)
   */
  async isFirstRun(): Promise<boolean> {
    return userRepo.count() === 0;
  },

  /**
   * Initialize system with first Administrator account, seeded tool catalog, and default policies
   */
  async setupAdministrator(params: {
    username: string;
    password: string;
    department?: string;
  }): Promise<AppUser> {
    const existingCount = userRepo.count();
    if (existingCount > 0) {
      throw new Error('System setup is already completed.');
    }

    const salt = generateSalt();
    const password_hash = await hashPassword(params.password, salt);

    const admin = await userRepo.create({
      username: params.username,
      password_hash,
      salt,
      role: 'Administrator',
      department: params.department || 'Security & Compliance',
      status: 'Active',
    });

    // Seed tools catalog, policies, settings
    await toolRepo.seedDefaults();
    await policyRepo.seedDefaults(admin.username);
    await settingsRepo.seedDefaults();

    await auditRepo.log({
      user_id: admin.user_id,
      action: 'SYSTEM_SETUP',
      target_type: 'system',
      target_id: admin.user_id,
      outcome: 'Success',
      details: `Administrator account "${admin.username}" created. Initial database seeded.`,
    });

    return admin;
  },

  /**
   * Authenticate user with password verification, lockout enforcement, and audit logging
   */
  async login(username: string, password: string): Promise<AppUser> {
    const cleanUser = username.trim();
    const now = Date.now();

    // Check lockout status
    const tracker = failedAttempts.get(cleanUser.toLowerCase());
    if (tracker && tracker.lockoutUntil > now) {
      const waitMinutes = Math.ceil((tracker.lockoutUntil - now) / 60000);
      throw new Error(`Account temporarily locked due to repeated failed attempts. Please retry in ${waitMinutes} minute(s).`);
    }

    const user = userRepo.getByUsername(cleanUser);
    if (!user) {
      // Record failed attempt
      this.recordFailedAttempt(cleanUser);
      await auditRepo.log({
        user_id: 'anonymous',
        action: 'LOGIN_FAILED',
        target_type: 'auth',
        target_id: null,
        outcome: 'Failure',
        details: `Failed login attempt for non-existent or invalid username "${cleanUser}".`,
      });
      throw new Error('Invalid username or password.');
    }

    if (user.status !== 'Active') {
      await auditRepo.log({
        user_id: user.user_id,
        action: 'LOGIN_BLOCKED',
        target_type: 'auth',
        target_id: user.user_id,
        outcome: 'Blocked',
        details: `Login blocked for inactive user account "${cleanUser}".`,
      });
      throw new Error('Your account is inactive. Please contact an Administrator.');
    }

    const isValid = await verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
      this.recordFailedAttempt(cleanUser);
      await auditRepo.log({
        user_id: user.user_id,
        action: 'LOGIN_FAILED',
        target_type: 'auth',
        target_id: user.user_id,
        outcome: 'Failure',
        details: `Invalid password supplied for user "${cleanUser}".`,
      });
      throw new Error('Invalid username or password.');
    }

    // Success: clear failed attempts
    failedAttempts.delete(cleanUser.toLowerCase());

    await auditRepo.log({
      user_id: user.user_id,
      action: 'LOGIN_SUCCESS',
      target_type: 'auth',
      target_id: user.user_id,
      outcome: 'Success',
      details: `User logged in with role [${user.role}].`,
    });

    return user;
  },

  recordFailedAttempt(username: string) {
    const key = username.toLowerCase();
    const current = failedAttempts.get(key) || { count: 0, lockoutUntil: 0 };
    current.count += 1;
    if (current.count >= MAX_FAILED_ATTEMPTS) {
      current.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    failedAttempts.set(key, current);
  },

  async logout(user: AppUser): Promise<void> {
    await auditRepo.log({
      user_id: user.user_id,
      action: 'LOGOUT',
      target_type: 'auth',
      target_id: user.user_id,
      outcome: 'Success',
      details: `User "${user.username}" logged out.`,
    });
  },
};
