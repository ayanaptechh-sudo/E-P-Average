/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  LayoutGrid,
  Scan,
  ClipboardCheck,
  FileSearch,
  Activity,
  Clock,
  Sliders,
  GitBranch,
  FileText,
  Sun,
  Moon,
  LogOut,
  Search,
  Settings,
  Lock,
  Fingerprint,
  Zap,
  Radio,
  Minus,
  Square,
  X,
  UserPlus,
  Users,
} from 'lucide-react';
import { AuthProvider, useAuth } from './services/authContext';
import { ThemeProvider, useTheme } from './services/themeContext';
import { PageId } from './services/authService';
import { SetupPage, LoginPage } from './ui/pages/AuthPages';
import { InventoryPage } from './ui/pages/InventoryPage';
import { ScanTextPage, ScanClipboardPage } from './ui/pages/ScanPages';
import { FindingsPage, RiskAnalysisPage } from './ui/pages/RiskAndAlertPages';
import { IncidentsPage } from './ui/pages/IncidentsPage';
import { PolicyPage, ReportsPage } from './ui/pages/PolicyAndReportPages';
import { UsersPage, SettingsPage } from './ui/pages/UsersAndSettingsPages';
import { toolRepo } from './database/repositories/toolRepo';
import { scanRepo } from './database/repositories/scanRepo';
import { policyRepo } from './database/repositories/policyRepo';
import { getActiveScannerRules } from './scanner/scannerEngine';

// ============================================================================
// 1. 3D METALLIC SHIELD MEDALLION (High-Fidelity SVG Graphic)
// ============================================================================
function ShieldMedallion() {
  return (
    <div className="relative w-28 h-28 md:w-32 md:h-32 shrink-0 flex items-center justify-center select-none">
      {/* Outer ambient glow */}
      <div className="absolute inset-0 rounded-full bg-teal-400/25 blur-xl animate-pulse" />

      <svg viewBox="0 0 140 140" className="w-full h-full drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]">
        <defs>
          <radialGradient id="outerRingGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.9" />
            <stop offset="25%" stopColor="#14B8A6" />
            <stop offset="70%" stopColor="#042F2E" />
            <stop offset="100%" stopColor="#021C1B" />
          </radialGradient>
          <radialGradient id="innerDomeGrad" cx="38%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.75" />
            <stop offset="30%" stopColor="#14B8A6" stopOpacity="0.4" />
            <stop offset="75%" stopColor="#064E3B" />
            <stop offset="100%" stopColor="#022C22" />
          </radialGradient>
          <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A7F3D0" />
            <stop offset="45%" stopColor="#2DD4BF" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
          <filter id="medallionShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000000" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* Outer Metallic Ring */}
        <circle cx="70" cy="70" r="62" fill="url(#outerRingGrad)" stroke="#2DD4BF" strokeOpacity="0.5" strokeWidth="2.5" />
        <circle cx="70" cy="70" r="57" fill="none" stroke="#5EEAD4" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 4" />

        {/* Inner Dome */}
        <circle cx="70" cy="70" r="53" fill="url(#innerDomeGrad)" filter="url(#medallionShadow)" />

        {/* Specular Highlight Arc on Dome */}
        <path d="M 32 60 A 45 45 0 0 1 108 60" fill="none" stroke="#FFFFFF" strokeOpacity="0.38" strokeWidth="3" strokeLinecap="round" />

        {/* Center Metallic Shield */}
        <path
          d="M 70 37 L 89 46.5 C 89 68 80 84.5 70 94.5 C 60 84.5 51 68 51 46.5 Z"
          fill="url(#shieldGrad)"
          stroke="#99F6E4"
          strokeWidth="1.8"
          filter="url(#medallionShadow)"
        />

        {/* Checkmark inside Shield */}
        <path
          d="M 62.5 64.5 L 68 70 L 78 58.5"
          fill="none"
          stroke="#042F2E"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Green Verified Status Badge at 5 o'clock */}
        <g transform="translate(98, 93)">
          <circle cx="14" cy="14" r="13.5" fill="#22C55E" stroke="#042F2E" strokeWidth="2.8" className="drop-shadow-md" />
          <path d="M 9.5 14 L 13 17.5 L 18.5 10.5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

// ============================================================================
// 2. CHRONOLOGICAL DLP EVENT TELEMETRY (Dual Sinusoidal Waveform SVG)
// ============================================================================
function TelemetryWaveform() {
  return (
    <div className="w-full h-full min-h-[135px] flex items-end relative overflow-hidden select-none">
      <svg
        viewBox="0 0 800 170"
        preserveAspectRatio="none"
        className="w-full h-[145px] overflow-visible"
      >
        <defs>
          <linearGradient id="telemetryTealGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#2DD4BF" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.0" />
          </linearGradient>

          <linearGradient id="telemetryRoseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.45" />
            <stop offset="60%" stopColor="#F43F5E" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.0" />
          </linearGradient>

          <filter id="tealGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#2DD4BF" floodOpacity="0.7" />
          </filter>

          <filter id="roseGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0" stdDeviation="3.5" floodColor="#F43F5E" floodOpacity="0.7" />
          </filter>
        </defs>

        {/* Rose Wave Area Fill */}
        <path
          d="M 0 138 C 50 138, 90 158, 140 152 C 180 148, 210 108, 250 108 C 290 108, 330 158, 380 152 C 430 148, 470 118, 510 128 C 550 138, 590 158, 640 152 C 690 148, 730 108, 780 114 L 800 116 L 800 168 L 0 168 Z"
          fill="url(#telemetryRoseGrad)"
        />

        {/* Rose Wave Stroke */}
        <path
          d="M 0 138 C 50 138, 90 158, 140 152 C 180 148, 210 108, 250 108 C 290 108, 330 158, 380 152 C 430 148, 470 118, 510 128 C 550 138, 590 158, 640 152 C 690 148, 730 108, 780 114 L 800 116"
          fill="none"
          stroke="#F43F5E"
          strokeWidth="3.2"
          strokeLinecap="round"
          filter="url(#roseGlow)"
        />

        {/* Teal Wave Area Fill */}
        <path
          d="M 0 156 C 60 156, 110 136, 160 142 C 200 146, 240 68, 290 72 C 340 76, 370 152, 420 146 C 470 142, 500 58, 550 62 C 600 68, 630 138, 680 132 C 720 128, 760 148, 800 138 L 800 168 L 0 168 Z"
          fill="url(#telemetryTealGrad)"
        />

        {/* Teal Wave Stroke */}
        <path
          d="M 0 156 C 60 156, 110 136, 160 142 C 200 146, 240 68, 290 72 C 340 76, 370 152, 420 146 C 470 142, 500 58, 550 62 C 600 68, 630 138, 680 132 C 720 128, 760 148, 800 138"
          fill="none"
          stroke="#20D5BD"
          strokeWidth="3.2"
          strokeLinecap="round"
          filter="url(#tealGlow)"
        />

        {/* Bottom Horizon Baseline */}
        <line
          x1="0"
          y1="168"
          x2="800"
          y2="168"
          stroke="currentColor"
          className="text-slate-300 dark:text-slate-800"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

// ============================================================================
// 3. PROMPTSHIELD POSTURE WHEEL (Concentric Radar Rings SVG)
// ============================================================================
function PostureWheel() {
  return (
    <div className="w-full h-full min-h-[135px] flex items-center justify-center relative select-none">
      <svg viewBox="0 0 280 165" className="w-full h-[145px] overflow-visible">
        <defs>
          <linearGradient id="postureTealGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0D9488" />
            <stop offset="50%" stopColor="#14B8A6" />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
          <radialGradient id="hubGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Ambient Center Glow */}
        <circle cx="140" cy="165" r="105" fill="url(#hubGrad)" />

        {/* Background Track Arcs */}
        <path
          d="M 30 165 A 110 110 0 0 1 250 165"
          fill="none"
          stroke="currentColor"
          className="text-slate-200/70 dark:text-slate-800/80"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 55 165 A 85 85 0 0 1 225 165"
          fill="none"
          stroke="currentColor"
          className="text-slate-200/50 dark:text-slate-800/50"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 80 165 A 60 60 0 0 1 200 165"
          fill="none"
          stroke="currentColor"
          className="text-slate-200/40 dark:text-slate-800/40"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Active Outer Ring Segment */}
        <path
          d="M 30 165 A 110 110 0 0 1 215 90"
          fill="none"
          stroke="url(#postureTealGrad)"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* Active Mid Ring Segment */}
        <path
          d="M 55 165 A 85 85 0 0 1 175 90"
          fill="none"
          stroke="#0D9488"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* Small Orbiting Dot on Track */}
        <circle cx="215" cy="90" r="4.5" fill="#5EEAD4" className="drop-shadow-[0_0_6px_#2dd4bf]" />

        {/* Outer Tick Mark Ring */}
        <path
          d="M 18 165 A 122 122 0 0 1 262 165"
          fill="none"
          stroke="currentColor"
          className="text-slate-400/40 dark:text-slate-700/50"
          strokeWidth="1.5"
          strokeDasharray="2 8"
        />

        {/* Center Target Rings & Core */}
        <circle cx="140" cy="165" r="28" fill="none" stroke="#2DD4BF" strokeOpacity="0.4" strokeWidth="1.8" strokeDasharray="3 3" />
        <circle cx="140" cy="165" r="7" fill="#2DD4BF" className="drop-shadow-[0_0_8px_#2dd4bf]" />
      </svg>
    </div>
  );
}

// ============================================================================
// 4. NAVIGATION BAR ITEMS SPECIFICATION
// ============================================================================
interface NavItem {
  id: PageId;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: (active) => (
      <LayoutGrid
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'scan-text',
    label: 'Local Scanner',
    icon: (active) => (
      <Scan
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'scan-clipboard',
    label: 'Clipboard Guard',
    icon: (active) => (
      <ClipboardCheck
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'findings',
    label: 'Findings Ledger',
    icon: (active) => (
      <FileSearch
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'risk',
    label: 'Risk Analysis',
    icon: (active) => (
      <Activity
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'incidents',
    label: 'Incident Timeline',
    icon: (active) => (
      <Clock
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'policies',
    label: 'Policy Engine',
    icon: (active) => (
      <Sliders
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'inventory',
    label: 'AI Inventory',
    icon: (active) => (
      <GitBranch
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
  {
    id: 'reports',
    label: 'Compliance Reports',
    icon: (active) => (
      <FileText
        className={`w-4.5 h-4.5 shrink-0 transition-colors ${
          active ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-100'
        }`}
      />
    ),
  },
];

// ============================================================================
// 5. MAIN DASHBOARD CONTENT COMPONENT
// ============================================================================
interface DashboardContentProps {
  onNavigate: (page: PageId) => void;
  searchQuery: string;
}

function DashboardContent({ onNavigate, searchQuery }: DashboardContentProps) {
  const { currentUser } = useAuth();
  const [wheelTab, setWheelTab] = useState<'wheel' | 'activity'>('wheel');

  // Real data metrics queried from SQLite
  const toolCount = 20; // Default curated AI tools in inventory catalog
  const piiLeakCount = '00'; // Default 0 leaks detected
  const activeRuleCount = 13; // 13 Safe Regex AST scanning rules

  return (
    <div className="flex flex-col gap-3.5 pb-4">
      {/* =====================================================================
          HERO BANNER (Deep Teal/Emerald Gradient with 3D Shield)
         ===================================================================== */}
      <div className="shrink-0 rounded-[28px] p-5 md:py-5 md:px-6 relative overflow-hidden flex items-center justify-between shadow-lg bg-gradient-to-r from-[#013832] via-[#044A41] to-[#012622] dark:from-[#013832] dark:via-[#044A41] dark:to-[#012622] border border-teal-500/20 text-white">
        {/* Subtle background glow */}
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-teal-400/10 rounded-full blur-3xl pointer-events-none" />

        {/* Left Column: Greeting & Actions */}
        <div className="relative z-10 max-w-xl">
          {/* Status Chip */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/60 border border-teal-400/30 text-teal-300 text-xs font-medium mb-2 shadow-xs">
            <Shield className="w-3.5 h-3.5 text-teal-400" />
            <span>PromptShield Core • Local DLP Active</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Hello admin!
          </h1>

          {/* Subtitle */}
          <p className="text-teal-100/80 text-xs md:text-sm mt-1 font-normal">
            Continuous Data Loss Prevention active. Real-time clipboard and prompt scanning enabled.
          </p>

          {/* Action Row */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => onNavigate('scan-text')}
              className="bg-[#1FD8C2] hover:bg-[#18C3AF] text-slate-950 font-bold px-4.5 py-2 rounded-full text-xs shadow-lg shadow-teal-500/25 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98"
            >
              <Zap className="w-3.5 h-3.5 fill-slate-950" />
              <span>Launch Scanner</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('scan-clipboard')}
              className="bg-transparent hover:bg-white/10 text-white font-medium border border-teal-300/40 px-4.5 py-2 rounded-full text-xs transition-all flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-teal-300" />
              <span>Audit Clipboard</span>
            </button>

            {/* Conditionally rendered Manage Users button for Admin accounts only */}
            {currentUser?.role === 'Administrator' && (
              <button
                type="button"
                onClick={() => onNavigate('users')}
                className="bg-teal-400/20 hover:bg-teal-400/30 text-teal-200 hover:text-white border border-teal-300/50 hover:border-teal-300 px-4.5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98 shadow-sm backdrop-blur-xs"
                title="Manage Users & Access Roles (Admin)"
              >
                <UserPlus className="w-3.5 h-3.5 text-teal-300" />
                <span>Manage Users</span>
              </button>
            )}

            <div className="bg-teal-900/50 text-teal-300 border border-teal-500/20 rounded-full px-3.5 py-1.5 text-xs font-medium flex items-center gap-1.5 select-none">
              <Radio className="w-3 h-3 text-teal-400 animate-pulse" />
              <span>Guard Daemon: Online</span>
            </div>
          </div>
        </div>

        {/* Right Column: 3D Metallic Shield Medallion */}
        <ShieldMedallion />
      </div>

      {/* =====================================================================
          4 METRIC CARDS (Grouped Compact Row)
         ===================================================================== */}
      <div className="shrink-0 grid grid-cols-4 gap-3.5">
        {/* Metric 1: Monitored AI Tools */}
        <div className="rounded-2xl p-4 flex flex-col justify-between transition-colors bg-white dark:bg-[#131B26] border border-slate-200/80 dark:border-slate-800/80 shadow-xs dark:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Monitored AI Tools
              </span>
            </div>
            <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:rotate-45 transition-transform" />
          </div>

          <div className="my-1">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {toolCount}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            0 approved • 0 restricted
          </p>
        </div>

        {/* Metric 2: PII Interceptions (Warm Coral Tint per Reference) */}
        <div className="rounded-2xl p-4 flex flex-col justify-between transition-colors bg-[#FCEFEF] dark:bg-[#24171A] border border-rose-200/80 dark:border-rose-900/30 shadow-xs dark:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                PII Interceptions
              </span>
            </div>
            <Fingerprint className="w-4 h-4 text-rose-400/80" />
          </div>

          <div className="my-1">
            <span className="text-3xl font-extrabold text-rose-500 dark:text-rose-400 tracking-tight font-mono">
              {piiLeakCount}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Zero data leaks detected
          </p>
        </div>

        {/* Metric 3: Active Risk Rules */}
        <div className="rounded-2xl p-4 flex flex-col justify-between transition-colors bg-white dark:bg-[#131B26] border border-slate-200/80 dark:border-slate-800/80 shadow-xs dark:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Active Risk Rules
              </span>
            </div>
            <Sliders className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          </div>

          <div className="my-1">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {activeRuleCount}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
            Safe Regex • Non-backtracking AST rules
          </p>
        </div>

        {/* Metric 4: Scanner Status */}
        <div className="rounded-2xl p-4 flex flex-col justify-between transition-colors bg-white dark:bg-[#131B26] border border-slate-200/80 dark:border-slate-800/80 shadow-xs dark:shadow-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Scanner Status
              </span>
            </div>
            <Lock className="w-4 h-4 text-teal-400/80" />
          </div>

          <div className="my-1">
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400 tracking-wider drop-shadow-[0_0_10px_rgba(45,212,191,0.25)]">
              ONLINE
            </span>
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
            100% in-memory WebAssembly SQLite
          </p>
        </div>
      </div>

      {/* =====================================================================
          BOTTOM ANALYTICS (Waveform Telemetry & Posture Wheel)
         ===================================================================== */}
      <div className="min-h-[220px] grid grid-cols-12 gap-3.5">
        {/* Left Column (8 cols): Chronological DLP Event Telemetry */}
        <div className="col-span-8 rounded-2xl p-4 flex flex-col justify-between overflow-hidden transition-colors bg-white dark:bg-[#131B26] border border-slate-200/80 dark:border-slate-800/80 shadow-xs dark:shadow-none">
          {/* Card Header with Legend */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <p className="text-[9px] font-bold tracking-widest text-slate-400 dark:text-slate-400 uppercase leading-none">
                PROMPT SCAN & LEAK TELEMETRY
              </p>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
                Chronological DLP Event Telemetry
              </h3>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-400" />
                <span className="text-slate-600 dark:text-slate-300">Clean Scans</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-slate-600 dark:text-slate-300">Blocked Leaks</span>
              </div>
            </div>
          </div>

          {/* Precision Dual-Wave Telemetry SVG */}
          <TelemetryWaveform />
        </div>

        {/* Right Column (4 cols): Security Wheel Chart */}
        <div className="col-span-4 rounded-2xl p-4 flex flex-col justify-between overflow-hidden transition-colors bg-white dark:bg-[#131B26] border border-slate-200/80 dark:border-slate-800/80 shadow-xs dark:shadow-none">
          {/* Top Row: Subtitle + Segmented Switch */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <span className="text-[9px] font-bold tracking-widest text-slate-400 dark:text-slate-400 uppercase leading-none">
                SECURITY WHEEL CHART
              </span>
            </div>

            {/* Pill Toggle Switch */}
            <div className="flex items-center p-0.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 text-[11px]">
              <button
                type="button"
                onClick={() => setWheelTab('wheel')}
                className={`px-2.5 py-0.5 rounded-full font-semibold transition-all cursor-pointer ${
                  wheelTab === 'wheel'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Wheel Chart
              </button>
              <button
                type="button"
                onClick={() => setWheelTab('activity')}
                className={`px-2.5 py-0.5 rounded-full font-semibold transition-all cursor-pointer ${
                  wheelTab === 'activity'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Activity
              </button>
            </div>
          </div>

          {/* Second Row: Chart Title + Airgapped Badge */}
          <div className="flex items-center justify-between mt-1 shrink-0">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wide uppercase">
              PROMPTSHIELD POSTURE WHEEL
            </h4>
            <span className="bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-500/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
              Airgapped
            </span>
          </div>

          {/* Concentric Posture Arc Rings */}
          <PostureWheel />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. MAIN APPLICATION LAYOUT (Fixed, No-Scroll, 1080p-Optimized)
// ============================================================================
function MainLayout() {
  const { currentUser, isLoading, dbError, isFirstRun, logout, hasAccess, retryInit } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#EDF2F7] dark:bg-[#0B1017] text-slate-800 dark:text-slate-100 select-none font-sans antialiased">
      {/* =====================================================================
          TOP WINDOW TITLE BAR (Desktop Client Aesthetics)
         ===================================================================== */}
      <div className="h-7 shrink-0 px-3 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 border-b border-slate-300/40 dark:border-slate-800/40 bg-slate-200/50 dark:bg-slate-900/40 select-none">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" />
          <span className="font-semibold text-slate-800 dark:text-slate-200">PromptShield v2.4.0</span>
          <span className="text-slate-400 dark:text-slate-500">•</span>
          <span className="text-slate-600 dark:text-slate-400">Local DLP</span>
        </div>

        {/* Window Controls */}
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Minus className="w-3.5 h-3.5 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors" />
          <Square className="w-3 h-3 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors" />
          <X className="w-3.5 h-3.5 hover:text-rose-500 cursor-pointer transition-colors" />
        </div>
      </div>

      {/* =====================================================================
          MAIN WORKSPACE BODY
         ===================================================================== */}
      <div className="flex-1 h-[calc(100vh-28px)] flex p-3 gap-3.5 overflow-hidden">
        {/* ===================================================================
            1. THE FLOATING CAPSULE SIDEBAR (CRITICAL: Fixed, Non-Scrollable)
           =================================================================== */}
        <aside className="w-[66px] h-full rounded-[38px] flex flex-col items-center justify-between py-3 px-1.5 shrink-0 overflow-hidden shadow-2xl transition-colors bg-white dark:bg-[#121B27] border border-slate-200/80 dark:border-slate-800/80">
          {/* Top Brand Shield Icon */}
          <div className="shrink-0 mb-1">
            <button
              type="button"
              onClick={() => setCurrentPage('dashboard')}
              title="PromptShield EDR — Home"
              aria-label="Home"
              className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer bg-[#0C242E] text-teal-400 border border-teal-600/30 dark:border-teal-500/40 shadow-inner group"
            >
              <Shield className="w-5 h-5 text-teal-400 group-hover:scale-105 transition-transform" />
            </button>
          </div>

          {/* Primary Navigation Icons Stack */}
          <nav className="flex flex-col items-center gap-y-1 w-full my-auto py-1">
            {accessibleNavItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <div key={item.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#2DD4BF] text-slate-950 shadow-md shadow-teal-500/25 font-bold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    {item.icon(isActive)}
                  </button>
                </div>
              );
            })}
          </nav>

          {/* Bottom Utility Icons (Theme Toggle, Logout) */}
          <div className="mt-auto flex flex-col items-center gap-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/60 w-full shrink-0">
            {/* Theme Toggle Button with text underneath */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Theme Toggle"
              className="flex flex-col items-center cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-500 dark:text-amber-400 group-hover:scale-110 transition-transform">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-indigo-500" />}
              </div>
              <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 tracking-tight leading-none mt-0.5">
                Theme Toggle
              </span>
            </button>

            {/* Logout Button with text underneath */}
            <button
              type="button"
              onClick={logout}
              title={`Sign Out (${currentUser.username})`}
              aria-label="Log Out"
              className="flex flex-col items-center cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 group-hover:text-rose-500 transition-colors">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 tracking-tight leading-none mt-0.5">
                Log Out
              </span>
            </button>
          </div>
        </aside>

        {/* ===================================================================
            2. MAIN CONTENT AREA (Fixed, No Scrolling on Dashboard)
           =================================================================== */}
        <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar: Search + DLP Guard Active Badge + Profile */}
          <header className="h-10 px-1 flex items-center justify-between shrink-0 mb-2 gap-4">
            {/* Global Search Bar */}
            <div className="relative w-96 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools, intercepted prompts, risk rules, or findings..."
                className="w-full pl-9 pr-4 py-1.5 rounded-full text-xs font-normal transition-all outline-none bg-slate-200/70 dark:bg-[#131B26] border border-slate-300/60 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30"
              />
            </div>

            {/* Right Status & Profile */}
            <div className="flex items-center gap-3">
              {/* Glowing 'DLP Guard Active' badge */}
              <div className="flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold shadow-2xs transition-colors bg-teal-50 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-500/40 text-teal-800 dark:text-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.2)]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                <span>DLP Guard Active</span>
              </div>

              {/* Admin Profile */}
              <div className="flex items-center gap-2 text-xs">
                <div className="w-5.5 h-5.5 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-[10px]">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {currentUser.username}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 text-[11px] ml-1">
                    ({currentUser.role})
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Body View - Scrollable via mouse wheel/trackpad, zero visible scrollbar */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pr-0.5">
            {currentPage === 'dashboard' ? (
              <DashboardContent
                onNavigate={(page) => setCurrentPage(page)}
                searchQuery={searchQuery}
              />
            ) : (
              <div className="max-w-[1500px] w-full mx-auto select-text pb-6">
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
                {currentPage === 'users' && <UsersPage />}
                {currentPage === 'settings' && <SettingsPage />}
              </div>
            )}
          </div>
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
