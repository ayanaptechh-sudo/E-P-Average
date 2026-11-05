/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield v2.5.0 - 100% Local Enterprise EDR Authentication Engine
 * Purely local, airgapped authentication against local SQLite database.
 */

import { AppUser, UserStatus } from '../database/types';
import { userRepo, auditRepo } from '../database/repositories/userRepo';
import { verifyPassword } from '../security/crypto';
import { authService } from './authService';

export type AuthSource = 'local_sqlite' | 'offline_local_cache';

export interface LoginResult {
  user: AppUser;
  authSource: AuthSource;
  message?: string;
}

export interface SyncListenerOptions {
  getCurrentUser: () => AppUser | null;
  onUserBannedOrRevoked: (reason: string, status: UserStatus) => void;
  onNetworkChange?: (isOnline: boolean) => void;
}

export async function checkOnlineStatus(): Promise<boolean> {
  return true;
}

/**
 * Validates that an account has an 'active' status.
 */
export function assertActiveStatus(status: UserStatus | string, username: string): void {
  const normalized = (status || '').toLowerCase();

  if (normalized === 'active') {
    return;
  }

  if (normalized === 'banned') {
    throw new Error(`Account Banned: User "${username}" has been permanently banned by an Administrator.`);
  }

  if (normalized === 'suspended') {
    throw new Error(`Account Suspended: User "${username}" is temporarily suspended. Please contact Security Operations.`);
  }

  if (normalized === 'restricted') {
    throw new Error('Account Restricted: Your account is currently restricted. Please contact your Security Administrator.');
  }

  throw new Error(`Account Access Denied: User status is "${status}". Only active accounts are permitted to sign in.`);
}

/**
 * 100% Local EDR Login:
 * Authenticates directly against the local SQLite database.
 */
export async function loginUser(username: string, password: string): Promise<LoginResult> {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) {
    throw new Error('Username and password are required.');
  }

  // Authenticate against local SQLite user database with lockout enforcement & audit logging
  const user = await authService.login(cleanUsername, password);

  return {
    user,
    authSource: 'local_sqlite',
    message: '100% Local Airgapped Authentication successful.',
  };
}

/**
 * Local status check listener with defensive case-insensitive status handling.
 * Safely verifies if the current session is still valid without terminating Active users.
 */
export function initStatusSyncListener(options: SyncListenerOptions): () => void {
  // Listen for browser network changes
  const handleOnline = () => options.onNetworkChange?.(true);
  const handleOffline = () => options.onNetworkChange?.(false);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Periodic security validation: verifies account is not deleted or banned in the local database
  const interval = setInterval(async () => {
    const user = options.getCurrentUser();
    if (!user) return;

    try {
      const refreshed = await userRepo.getById(user.user_id);
      
      // Case 1: Account was deleted from the local database
      if (!refreshed) {
        options.onUserBannedOrRevoked(
          'Your account was removed from the local database. Session terminated.',
          'banned'
        );
        return;
      }

      // Case 2: Case-insensitive check. If user is Active, never terminate session!
      const normalizedStatus = (refreshed.status || '').trim().toLowerCase();
      if (normalizedStatus === 'active') {
        return; // Valid session, do nothing
      }

      // Case 3: Genuine administrative revocation (e.g. banned, suspended, restricted, disabled)
      options.onUserBannedOrRevoked(
        `Account status updated to "${refreshed.status}" by an Administrator. Session terminated.`,
        refreshed.status
      );
    } catch {
      // Ignore transient query errors
    }
  }, 10000);

  return () => {
    clearInterval(interval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }
  };
}
