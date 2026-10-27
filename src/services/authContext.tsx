/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppUser, UserRole } from '../database/types';
import { authService, PageId, ROLE_PERMISSIONS } from './authService';
import { initDatabase } from '../database/db';
import { settingsRepo } from '../database/repositories/reportRepo';
import { policyRepo } from '../database/repositories/policyRepo';

interface AuthContextType {
  currentUser: AppUser | null;
  isLoading: boolean;
  dbError: string | null;
  isFirstRun: boolean;
  login: (u: string, p: string) => Promise<void>;
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
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);

  const timeoutTimerRef = useRef<number | null>(null);

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

  const logout = useCallback(async () => {
    if (currentUser) {
      try {
        await authService.logout(currentUser);
      } catch (e) {
        console.warn('Logout audit log error:', e);
      }
    }
    setCurrentUser(null);
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

  const login = async (username: string, password: string) => {
    const user = await authService.login(username, password);
    setCurrentUser(user);
    try {
      const timeoutStr = settingsRepo.get('session_timeout_minutes', '30');
      setSessionTimeoutMinutes(parseInt(timeoutStr, 10) || 30);
    } catch {}
  };

  const setupAdmin = async (username: string, password: string, dept?: string) => {
    const admin = await authService.setupAdministrator({
      username,
      password,
      department: dept,
    });
    setIsFirstRun(false);
    setCurrentUser(admin);
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
