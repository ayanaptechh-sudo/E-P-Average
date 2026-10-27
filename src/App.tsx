/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  LayoutDashboard,
  Cpu,
  Scan,
  FileSearch,
  Activity,
  Clock,
  Sliders,
  FileText,
  Settings,
  ClipboardCheck,
  LogOut,
  Search,
} from 'lucide-react';
import { AuthProvider, useAuth } from './services/authContext';
import { ThemeProvider } from './services/themeContext';
import { ThemeToggle } from './ui/components/ThemeToggle';
import { PageId } from './services/authService';
import { SetupPage, LoginPage } from './ui/pages/AuthPages';
import { DashboardPage } from './ui/pages/DashboardPage';
import { InventoryPage } from './ui/pages/InventoryPage';
import { ScanTextPage, ScanClipboardPage } from './ui/pages/ScanPages';
import { FindingsPage, AlertsPage, RiskAnalysisPage } from './ui/pages/RiskAndAlertPages';
import { IncidentsPage } from './ui/pages/IncidentsPage';
import { PolicyPage, ReportsPage } from './ui/pages/PolicyAndReportPages';
import { UsersPage, SettingsPage } from './ui/pages/UsersAndSettingsPages';

interface NavItem {
  id: PageId;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  category: 'Workspace' | 'Security & Risk' | 'Governance';
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    category: 'Workspace',
    icon: (active) => (
      <LayoutDashboard
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'inventory',
    label: 'AI Inventory',
    category: 'Workspace',
    icon: (active) => (
      <Cpu
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'scan-text',
    label: 'Local Scanner',
    category: 'Workspace',
    icon: (active) => (
      <Scan
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'scan-clipboard',
    label: 'Clipboard Guard',
    category: 'Workspace',
    icon: (active) => (
      <ClipboardCheck
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'findings',
    label: 'Findings Ledger',
    category: 'Security & Risk',
    icon: (active) => (
      <FileSearch
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'risk',
    label: 'Risk Analysis',
    category: 'Security & Risk',
    icon: (active) => (
      <Activity
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'incidents',
    label: 'Incident Timeline',
    category: 'Security & Risk',
    icon: (active) => (
      <Clock
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'policies',
    label: 'Policy Engine',
    category: 'Governance',
    icon: (active) => (
      <Sliders
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'reports',
    label: 'Compliance Reports',
    category: 'Governance',
    icon: (active) => (
      <FileText
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
  {
    id: 'settings',
    label: 'Settings & Audit',
    category: 'Governance',
    icon: (active) => (
      <Settings
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${active ? 'text-slate-950' : 'text-slate-400 group-hover:text-white'}`}
      />
    ),
  },
];

function MainLayout() {
  const { currentUser, isLoading, dbError, isFirstRun, logout, hasAccess, retryInit } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (currentUser) {
      if (!hasAccess(currentPage)) {
        if (currentUser.role === 'End User') {
          setCurrentPage('scan-text');
        } else if (currentUser.role === 'Manager') {
          setCurrentPage('dashboard');
        } else if (currentUser.role === 'Auditor') {
          setCurrentPage('incidents');
        } else {
          setCurrentPage('dashboard');
        }
      }
    }
  }, [currentUser, currentPage, hasAccess]);

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-700 dark:text-slate-200 font-sans p-4 select-none">
        <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-800 border-t-teal-500 rounded-full animate-spin mb-3" />
        <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
          Starting PromptShield EDR Core
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-1">
          Loading WebAssembly SQLite engine
        </p>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-800 dark:text-slate-200 font-sans">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-lg text-center">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-200 dark:border-rose-900">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">DLP Engine Offline</h2>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 mb-4 font-mono text-left break-words">
            {dbError}
          </div>
          <button
            onClick={() => retryInit()}
            className="w-full py-2.5 px-4 text-xs font-semibold text-slate-950 bg-teal-500 hover:bg-teal-400 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Retry Local Database
          </button>
        </div>
      </div>
    );
  }

  if (isFirstRun) {
    return <SetupPage />;
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  const accessibleNavItems = NAV_ITEMS.filter((item) => hasAccess(item.id));

  return (
    <div className="h-screen flex bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 antialiased overflow-hidden select-none">
      {/* =========================================================================
          STATIC SOLID DARK SIDEBAR (NO SCROLLBARS, NO SLIDERS, NO SCROLLING)
         ========================================================================= */}
      <aside className="h-screen overflow-hidden flex flex-col w-[72px] bg-slate-900 text-white py-3 px-2 items-center shrink-0 z-30 border-r border-slate-800/80 shadow-2xl">
        {/* Brand Shield Icon */}
        <div className="flex flex-col items-center shrink-0 mb-2">
          <button
            type="button"
            onClick={() => setCurrentPage('dashboard')}
            className="w-10 h-10 p-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-inner group transition-all cursor-pointer relative"
            title="PromptShield EDR — Home"
            aria-label="PromptShield EDR Home"
          >
            <Shield className="w-5 h-5 text-teal-400 group-hover:scale-105 transition-transform" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-teal-400 rounded-full border-2 border-slate-900 animate-pulse" />
          </button>
        </div>

        {/* Navigation Icons Stack */}
        <nav className="flex flex-col items-center gap-1.5 w-full">
          {accessibleNavItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => setCurrentPage(item.id)}
                  title={item.label}
                  aria-label={item.label}
                  className={`w-9 h-9 p-2 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isActive
                      ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/25 font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/90'
                  }`}
                >
                  {item.icon(isActive)}
                </button>
              </div>
            );
          })}
        </nav>

        {/* Bottom Actions: Theme Toggle & Logout */}
        <div className="mt-auto flex flex-col items-center gap-1.5 pt-2 border-t border-slate-800/80 w-full shrink-0">
          <div className="relative group">
            <ThemeToggle className="w-9 h-9 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center shadow-xs cursor-pointer" />
          </div>

          <div className="relative group">
            <button
              type="button"
              onClick={() => logout()}
              title={`Sign Out (${currentUser.username})`}
              aria-label="Sign Out"
              className="w-9 h-9 p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/90 flex items-center justify-center transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          MAIN EDR WORKSPACE AREA
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden p-3 gap-3.5">
        {/* Top Bar matching reference EDR interface */}
        <header className="h-13 px-1 flex items-center justify-between shrink-0 mb-3 gap-4">
          {/* Pill Search Bar */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools, intercepted prompts, risk rules, or findings..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-full text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-2xs focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all font-medium"
            />
          </div>

          {/* Right Header Status & Profile Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-200/80 dark:border-teal-800/80 text-teal-700 dark:text-teal-300 text-xs font-semibold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              <span>DLP Guard Active</span>
            </div>

            {/* User Badge */}
            <div className="flex items-center gap-2 pl-2 pr-3.5 py-1.5 bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-full shadow-2xs text-xs">
              <div className="w-5 h-5 rounded-full bg-teal-500 text-slate-950 font-bold flex items-center justify-center text-[10px]">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {currentUser.username}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                ({currentUser.role})
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          <main className="max-w-[1500px] w-full mx-auto select-text pb-6">
            {currentPage === 'dashboard' && (
              <DashboardPage onNavigate={(p) => setCurrentPage(p as PageId)} />
            )}
            {currentPage === 'inventory' && <InventoryPage />}
            {currentPage === 'scan-text' && <ScanTextPage />}
            {currentPage === 'scan-clipboard' && <ScanClipboardPage />}
            {currentPage === 'findings' && (
              <FindingsPage onNavigateToIncidents={() => setCurrentPage('incidents')} />
            )}
            {currentPage === 'risk' && <RiskAnalysisPage />}
            {currentPage === 'incidents' && <IncidentsPage />}
            {currentPage === 'policies' && <PolicyPage />}
            {currentPage === 'reports' && <ReportsPage />}
            {currentPage === 'settings' && <SettingsPage />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}
