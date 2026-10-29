/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppUser, UserStatus } from '../database/types';

// Default / fallback Supabase credentials from Vite environment or Local Storage
const ENV_SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const ENV_SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const STORAGE_KEY_URL = 'promptshield_supabase_url';
const STORAGE_KEY_ANON = 'promptshield_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

let cachedClient: SupabaseClient | null = null;
let currentConfigString = '';

/**
 * Get active Supabase URL and Key (environment variable with localStorage override)
 */
export function getSupabaseConfig(): SupabaseConfig {
  let storedUrl = '';
  let storedKey = '';

  try {
    storedUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
    storedKey = localStorage.getItem(STORAGE_KEY_ANON) || '';
  } catch {}

  const url = storedUrl.trim() || ENV_SUPABASE_URL.trim();
  const anonKey = storedKey.trim() || ENV_SUPABASE_ANON_KEY.trim();

  return { url, anonKey };
}

/**
 * Save custom Supabase configuration (e.g. from Settings)
 */
export function setSupabaseConfig(url: string, anonKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
    localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
    cachedClient = null; // force re-instantiation
  } catch (err) {
    console.warn('[Supabase] Failed to persist config to localStorage:', err);
  }
}

/**
 * Check if Supabase credentials have been configured
 */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey && url.startsWith('http'));
}

/**
 * Get or initialize the Supabase client singleton
 */
export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return null;
  }

  const configSignature = `${url}::${anonKey}`;
  if (cachedClient && currentConfigString === configSignature) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          'x-client-info': 'promptshield-desktop-dlp',
        },
      },
    });
    currentConfigString = configSignature;
    return cachedClient;
  } catch (err) {
    console.warn('[Supabase] Failed to instantiate Supabase client:', err);
    return null;
  }
}

/**
 * Utility to run an async operation with a strict timeout rejection
 */
export async function withTimeout<T>(
  promise: PromiseLike<T> | Promise<T>,
  timeoutMs = 4000,
  timeoutMessage = 'Network request timed out'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([Promise.resolve(promise), timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Ping Supabase to verify online reachability and latency
 */
export async function pingSupabase(timeoutMs = 3500): Promise<{ reachable: boolean; latencyMs: number }> {
  const client = getSupabaseClient();
  if (!client) {
    return { reachable: false, latencyMs: -1 };
  }

  const start = performance.now();
  try {
    // Try pinging the table or auth endpoint
    const checkPromise = client.from('promptshield_users').select('user_id').limit(1);
    await withTimeout(checkPromise, timeoutMs, 'Supabase ping timed out');
    const latencyMs = Math.round(performance.now() - start);
    return { reachable: true, latencyMs };
  } catch (err) {
    // Also try alternative table name if promptshield_users table is not yet created
    try {
      const fallbackPromise = client.from('app_users').select('user_id').limit(1);
      await withTimeout(fallbackPromise, timeoutMs, 'Supabase fallback ping timed out');
      return { reachable: true, latencyMs: Math.round(performance.now() - start) };
    } catch {
      return { reachable: false, latencyMs: -1 };
    }
  }
}

/**
 * Fetch a user record by username from Supabase with timeout
 */
export async function fetchUserFromSupabase(
  username: string,
  timeoutMs = 4500
): Promise<AppUser | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const cleanUser = username.trim();

  const fetchPromise = async (): Promise<AppUser | null> => {
    // First try "promptshield_users"
    const { data, error } = await client
      .from('promptshield_users')
      .select('user_id, username, password_hash, salt, role, department, status, created_at')
      .ilike('username', cleanUser)
      .maybeSingle();

    if (!error && data) {
      return data as AppUser;
    }

    // Secondary try "app_users"
    const fallbackRes = await client
      .from('app_users')
      .select('user_id, username, password_hash, salt, role, department, status, created_at')
      .ilike('username', cleanUser)
      .maybeSingle();

    if (!fallbackRes.error && fallbackRes.data) {
      return fallbackRes.data as AppUser;
    }

    return null;
  };

  return await withTimeout(fetchPromise(), timeoutMs, 'Remote Supabase fetch timed out');
}

/**
 * Fetch a user's current account status by userId or username from Supabase
 */
export async function fetchUserStatusFromSupabase(
  userIdOrUsername: { userId?: string; username?: string },
  timeoutMs = 4000
): Promise<UserStatus | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  const queryPromise = async (): Promise<UserStatus | null> => {
    let query = client.from('promptshield_users').select('status');

    if (userIdOrUsername.userId) {
      query = query.eq('user_id', userIdOrUsername.userId);
    } else if (userIdOrUsername.username) {
      query = query.ilike('username', userIdOrUsername.username.trim());
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data?.status) {
      return data.status as UserStatus;
    }

    // Try fallback table name 'app_users'
    let query2 = client.from('app_users').select('status');
    if (userIdOrUsername.userId) {
      query2 = query2.eq('user_id', userIdOrUsername.userId);
    } else if (userIdOrUsername.username) {
      query2 = query2.ilike('username', userIdOrUsername.username.trim());
    }

    const res2 = await query2.maybeSingle();
    if (!res2.error && res2.data?.status) {
      return res2.data.status as UserStatus;
    }

    return null;
  };

  return await withTimeout(queryPromise(), timeoutMs, 'Status check timed out');
}

/**
 * Push or update user record into Supabase (for admin user provisioning sync)
 */
export async function pushUserToSupabase(user: AppUser, timeoutMs = 5000): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  const pushPromise = async (): Promise<boolean> => {
    const payload = {
      user_id: user.user_id,
      username: user.username,
      password_hash: user.password_hash,
      salt: user.salt,
      role: user.role,
      department: user.department,
      status: user.status,
      created_at: user.created_at,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('promptshield_users').upsert(payload, {
      onConflict: 'username',
    });

    if (error) {
      console.warn('[Supabase] Failed to push user to promptshield_users, trying app_users:', error);
      const res2 = await client.from('app_users').upsert(payload, {
        onConflict: 'username',
      });
      return !res2.error;
    }

    return true;
  };

  try {
    return await withTimeout(pushPromise(), timeoutMs, 'Push user timed out');
  } catch (err) {
    console.warn('[Supabase] pushUserToSupabase error:', err);
    return false;
  }
}
