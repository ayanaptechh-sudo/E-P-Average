/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppUser, UserStatus } from '../database/types';
import { userRepo, auditRepo } from '../database/repositories/userRepo';
import { verifyPassword } from '../security/crypto';
import { authService } from './authService';
import {
  fetchUserFromSupabase,
  fetchUserStatusFromSupabase,
  isSupabaseConfigured,
  pingSupabase,
} from './supabaseClient';

export type AuthSource = 'online_supabase' | 'offline_local_cache' | 'offline_network_fallback';

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

/**
 * Check if the application currently has active internet connectivity.
 * Combines navigator.onLine with an optional lightweight ping test.
 */
export async function checkOnlineStatus(verifyWithPing = false): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return true;
  }

  // Fast navigator check
  if (!navigator.onLine) {
    return false;
  }

  // If Supabase is configured and caller asks for active ping verification
  if (verifyWithPing && isSupabaseConfigured()) {
    try {
      const ping = await pingSupabase(2500);
      return ping.reachable;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Synchronize / cache a verified user into the local sql.js (SQLite) database.
 * Executes an INSERT OR REPLACE to keep credentials, role, and status up-to-date.
 */
export async function syncLocalUser(user: AppUser): Promise<void> {
  try {
    await userRepo.insertOrReplace(user);
    console.info(`[AuthSync] Successfully synced user "${user.username}" (status: ${user.status}) to local SQLite.`);
  } catch (err) {
    console.error('[AuthSync] Failed to sync user to local SQLite database:', err);
    throw new Error('Local SQLite sync failed after online verification.');
  }
}

/**
 * Helper to validate user status string.
 * Accounts with status other than 'active' (case-insensitive) are rejected with descriptive errors.
 */
export function assertActiveStatus(status: string | undefined, username: string): void {
  const normalized = (status || '').toLowerCase().trim();

  if (normalized === 'active') {
    return;
  }

  if (normalized === 'banned') {
    throw new Error('Account Banned: Your account has been permanently banned due to security policy violations.');
  }

  if (normalized === 'suspended') {
    throw new Error('Account Suspended: Your access has been temporarily suspended by an Administrator.');
  }

  if (normalized === 'restricted') {
    throw new Error('Account Restricted: Your account is currently restricted. Please contact your Security Administrator.');
  }

  throw new Error(`Account Access Denied: User status is "${status}". Only active accounts are permitted to sign in.`);
}

/**
 * Main Offline-First Login Function:
 * 1. If online:
 *    - Query Supabase for latest user credentials & status.
 *    - If user exists, verify status & password.
 *    - On success, immediately INSERT OR REPLACE into local SQLite.
 *    - Fallback gracefully to local SQLite on network failure/timeout.
 * 2. If offline:
 *    - Bypass network cleanly.
 *    - Authenticate directly against local SQLite cached data.
 *    - Enforce local 'active' status check.
 */
export async function loginUser(username: string, password: string): Promise<LoginResult> {
  const cleanUsername = username.trim();
  if (!cleanUsername || !password) {
    throw new Error('Username and password are required.');
  }

  const isOnline = await checkOnlineStatus(false);

  // =========================================================================
  // 1. ONLINE MODE FLOW (Supabase Primary with Local SQLite Upsert)
  // =========================================================================
  if (isOnline && isSupabaseConfigured()) {
    try {
      console.info(`[AuthSync] Online mode detected. Verifying "${cleanUsername}" with Supabase...`);
      const remoteUser = await fetchUserFromSupabase(cleanUsername, 4500);

      if (remoteUser) {
        // Enforce account status check on Supabase data
        try {
          assertActiveStatus(remoteUser.status, remoteUser.username);
        } catch (statusErr) {
          // Sync banned/suspended status to local SQLite immediately so offline mode is also blocked
          try {
            await userRepo.insertOrReplace(remoteUser);
          } catch {}

          await auditRepo.log({
            user_id: remoteUser.user_id,
            action: 'LOGIN_BLOCKED_ONLINE',
            target_type: 'auth',
            target_id: remoteUser.user_id,
            outcome: 'Blocked',
            details: `Online login blocked by Supabase for "${cleanUsername}". Status: ${remoteUser.status}.`,
          });

          throw statusErr;
        }

        // Verify password against remote salt and hash
        const isPasswordValid = await verifyPassword(
          password,
          remoteUser.salt,
          remoteUser.password_hash
        );

        if (!isPasswordValid) {
          authService.recordFailedAttempt(cleanUsername);
          await auditRepo.log({
            user_id: remoteUser.user_id,
            action: 'LOGIN_FAILED_ONLINE',
            target_type: 'auth',
            target_id: remoteUser.user_id,
            outcome: 'Failure',
            details: `Invalid password supplied for online user "${cleanUsername}".`,
          });
          throw new Error('Invalid username or password.');
        }

        // SUCCESS: Immediately upsert into local SQLite database (Offline-First cache)
        await syncLocalUser(remoteUser);

        await auditRepo.log({
          user_id: remoteUser.user_id,
          action: 'LOGIN_SUCCESS_ONLINE',
          target_type: 'auth',
          target_id: remoteUser.user_id,
          outcome: 'Success',
          details: `User "${remoteUser.username}" authenticated via Supabase and synced to local SQLite cache.`,
        });

        return {
          user: remoteUser,
          authSource: 'online_supabase',
          message: 'Authenticated online via Supabase. Local cache updated.',
        };
      } else {
        // User not found in Supabase table; fall back to checking local SQLite
        console.warn(`[AuthSync] User "${cleanUsername}" not found in Supabase. Checking local SQLite...`);
      }
    } catch (networkOrAuthErr: unknown) {
      // If error is a status error (e.g. Banned) or invalid password, rethrow directly
      const errMsg = networkOrAuthErr instanceof Error ? networkOrAuthErr.message : String(networkOrAuthErr);
      if (
        errMsg.includes('Account Banned') ||
        errMsg.includes('Account Suspended') ||
        errMsg.includes('Account Restricted') ||
        errMsg.includes('Account Access Denied') ||
        errMsg.includes('Invalid username or password.')
      ) {
        throw networkOrAuthErr;
      }

      console.warn('[AuthSync] Supabase online request failed or timed out. Falling back to local SQLite cache:', networkOrAuthErr);
      // Graceful fallback to local authentication below
      try {
        const localUser = await authService.login(cleanUsername, password);
        return {
          user: localUser,
          authSource: 'offline_network_fallback',
          message: 'Network issue encountered. Authenticated using local SQLite cache.',
        };
      } catch (localErr) {
        throw localErr;
      }
    }
  }

  // =========================================================================
  // 2. OFFLINE MODE FLOW (sql.js / SQLite Direct Authentication)
  // =========================================================================
  console.info(`[AuthSync] Operating in Offline / Local Mode. Authenticating "${cleanUsername}" directly via local SQLite...`);

  try {
    const localUser = await authService.login(cleanUsername, password);
    return {
      user: localUser,
      authSource: 'offline_local_cache',
      message: 'Authenticated offline via local SQLite cache.',
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!isOnline && errMsg.includes('Invalid username or password.')) {
      throw new Error('Invalid username or password. (Offline Mode: please ensure this account was previously logged in while online to cache credentials).');
    }
    throw err;
  }
}

/**
 * 3. REAL-TIME / BACKGROUND STATUS SYNCING
 * Listens for:
 * - window 'online' network reconnection event
 * - window 'offline' event
 * - Periodic background check (every 30 seconds while online)
 *
 * If an active user's status in Supabase was changed to 'banned', 'suspended', or 'restricted':
 * - Updates the local SQLite database immediately
 * - Triggers onUserBannedOrRevoked callback to kick the active session immediately!
 */
export function initStatusSyncListener(options: SyncListenerOptions): () => void {
  const { getCurrentUser, onUserBannedOrRevoked, onNetworkChange } = options;
  let isChecking = false;

  // Background check helper
  const performStatusCheck = async (triggerSource: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser || isChecking) {
      return;
    }

    if (!navigator.onLine || !isSupabaseConfigured()) {
      return;
    }

    try {
      isChecking = true;
      console.info(`[AuthSync] Checking user status in background (${triggerSource}) for "${currentUser.username}"...`);

      const remoteStatus = await fetchUserStatusFromSupabase({
        userId: currentUser.user_id,
        username: currentUser.username,
      }, 4000);

      if (!remoteStatus) {
        return;
      }

      const normalizedRemote = remoteStatus.toLowerCase().trim();
      const normalizedLocal = (currentUser.status || '').toLowerCase().trim();

      // If status changed or user is not active
      if (normalizedRemote !== normalizedLocal || normalizedRemote !== 'active') {
        console.warn(`[AuthSync] User status update detected on Supabase: "${currentUser.status}" -> "${remoteStatus}"`);

        // Update local SQLite database immediately
        await userRepo.updateStatus(currentUser.user_id, remoteStatus);

        // If user is now banned, suspended, or restricted, immediately revoke session
        if (normalizedRemote !== 'active') {
          await auditRepo.log({
            user_id: currentUser.user_id,
            action: 'SESSION_REVOKED_REMOTE_STATUS',
            target_type: 'auth',
            target_id: currentUser.user_id,
            outcome: 'Blocked',
            details: `Active user session terminated. Supabase status changed to "${remoteStatus}" (Trigger: ${triggerSource}).`,
          });

          const reason =
            normalizedRemote === 'banned'
              ? 'Your account has been banned by an Administrator. Session terminated.'
              : normalizedRemote === 'suspended'
              ? 'Your account has been suspended by an Administrator. Session terminated.'
              : `Your account status was changed to "${remoteStatus}". Session terminated.`;

          onUserBannedOrRevoked(reason, remoteStatus);
        }
      }
    } catch (err) {
      console.warn(`[AuthSync] Background status sync skipped due to network/timeout (${triggerSource}):`, err);
    } finally {
      isChecking = false;
    }
  };

  // Event handlers
  const handleOnline = () => {
    console.info('[AuthSync] Network reconnected (online event).');
    onNetworkChange?.(true);
    performStatusCheck('Network Reconnection');
  };

  const handleOffline = () => {
    console.info('[AuthSync] Network disconnected (offline event).');
    onNetworkChange?.(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Background periodic heartbeat polling (every 30 seconds when online)
  const intervalId = window.setInterval(() => {
    if (navigator.onLine) {
      performStatusCheck('Periodic Heartbeat');
    }
  }, 30000);

  // Return cleanup unbind function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.clearInterval(intervalId);
  };
}
