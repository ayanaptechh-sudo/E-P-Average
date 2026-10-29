/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppUser } from '../database/types';
import { authService, PageId, ROLE_PERMISSIONS } from './authService';
import { initDatabase } from '../database/db';
import { settingsRepo } from '../database/repositories/reportRepo';
import { policyRepo } from '../database/repositories/policyRepo';
import { loginUser, initStatusSyncListener, AuthSource } from './authSync';
import { isSupabaseConfigured, pushUserToSupabase } from './supabaseClient';

interface AuthContextType {
  currentUser: AppUser | null;
  isLoading: boolean;
  dbError: string | null;
  isFirstRun: boolean;
  isOnline: boolean;
  authSource: AuthSource | null;
  revocationMessage: string | null;
  clearRevocationMessage: () => void;
  login: (u: string, p: string) => Promise<{ authSource: AuthSource; message?: string }>;
  logout: () => Promise<void>;
  setupAdmin: (u: string, p: string, dept?: string) => Promise<void>;
  hasAccess: (pageId: PageId) => boolean;
  sessionTimeoutMinutes: number;
  retryInit: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [authSource, setAuthSource] = useState<AuthSource | null>(null);
  const [revocationMessage, setRevocationMessage] = useState<string | null>(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);

  const timeoutTimerRef = useRef<number | null>(null);
  const currentUserRef = useRef<AppUser | null>(null);
  currentUserRef.current = currentUser;

  const startDbInit = useCallback(async () => {
    setIsLoading(true);
    setDbError(null);
    try {
      const { isFirstRun: firstRun } = await initDatabase();
      setIsFirstRun(firstRun);
      try {
        await policyRepo.migrateScannerRules();
      } catch (syncErr) {
        console.warn('Failed to migrate scanner rules:', syncErr);
      }
      try {
        const timeoutStr = settingsRepo.get('session_timeout_minutes', '30');
        setSessionTimeoutMinutes(parseInt(timeoutStr, 10) || 30);
      } catch (settingsErr) {
        console.warn('Could not read session timeout setting, defaulting to 30m:', settingsErr);
      }
    } catch (err: unknown) {
      console.error('Failed to initialize local SQLite database:', err);
      setDbError(err instanceof Error ? err.message : String(err));
      setIsFirstRun(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize DB on component mount
  useEffect(() => {
    startDbInit();
  }, [startDbInit]);

  // Real-time network & background status syncing
  useEffect(() => {
    const cleanup = initStatusSyncListener({
      getCurrentUser: () => currentUserRef.current,
      onUserBannedOrRevoked: (reason, status) => {
        console.warn(`[AuthProvider] User session revoked in real-time due to remote status change (${status}):`, reason);
        setRevocationMessage(reason);
        setCurrentUser(null);
        setAuthSource(null);
      },
      onNetworkChange: (online) => {
        setIsOnline(online);
      },
    });

    return cleanup;
  }, []);

  const logout = useCallback(async () => {
    if (currentUser) {
      try {
        await authService.logout(currentUser);
      } catch (e) {
        console.warn('Logout audit log error:', e);
      }
    }
    setCurrentUser(null);
    setAuthSource(null);
    if (timeoutTimerRef.current) {
      window.clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, [currentUser]);

  // Session timeout handler
  const resetSessionTimer = useCallback(() => {
    if (!currentUser) return;
    if (timeoutTimerRef.current) {
      window.clearTimeout(timeoutTimerRef.current);
    }
    const ms = sessionTimeoutMinutes * 60 * 1000;
    timeoutTimerRef.current = window.setTimeout(() => {
      console.warn('Session expired due to inactivity.');
      logout();
    }, ms);
  }, [currentUser, sessionTimeoutMinutes, logout]);

  // Listen to user activity to reset session timeout
  useEffect(() => {
    if (!currentUser) return;
    resetSessionTimer();

    const handleActivity = () => {
      resetSessionTimer();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      if (timeoutTimerRef.current) {
        window.clearTimeout(timeoutTimerRef.current);
      }
    };
  }, [currentUser, resetSessionTimer]);

  const login = async (username: string, password: string): Promise<{ authSource: AuthSource; message?: string }> => {
    // Execute Offline-First / Local-First Login Flow
    const result = await loginUser(username, password);
    setCurrentUser(result.user);
    setAuthSource(result.authSource);
    setRevocationMessage(null);

    try {
      const timeoutStr = settingsRepo.get('session_timeout_minutes', '30');
      setSessionTimeoutMinutes(parseInt(timeoutStr, 10) || 30);
    } catch {}

    return { authSource: result.authSource, message: result.message };
  };

  const setupAdmin = async (username: string, password: string, dept?: string) => {
    const admin = await authService.setupAdministrator({
      username,
      password,
      department: dept,
    });
    setIsFirstRun(false);
    setCurrentUser(admin);
    setAuthSource('offline_local_cache');

    // Attempt to push initial admin to Supabase if configured and online
    try {
      if (navigator.onLine && isSupabaseConfigured()) {
        pushUserToSupabase(admin).catch((err) => {
          console.warn('[AuthProvider] Supabase initial admin sync deferred:', err);
        });
      }
    } catch {}
  };

  const clearRevocationMessage = () => {
    setRevocationMessage(null);
  };

  const hasAccess = (pageId: PageId): boolean => {
    if (!currentUser) return false;
    const allowed = ROLE_PERMISSIONS[currentUser.role] || [];
    return allowed.includes(pageId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        dbError,
        isFirstRun,
        isOnline,
        authSource,
        revocationMessage,
        clearRevocationMessage,
        login,
        logout,
        setupAdmin,
        hasAccess,
        sessionTimeoutMinutes,
        retryInit: startDbInit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
