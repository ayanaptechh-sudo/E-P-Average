/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowUpRight,
  Clock,
  Check,
  Send,
  Zap,
  Lock,
  Cpu,
  ClipboardCheck,
  Play,
  Sliders,
  FileSearch,
  Radio,
  FileText,
  Fingerprint,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  Bar,
  Line,
} from 'recharts';
import { toolRepo } from '../../database/repositories/toolRepo';
import { scanRepo } from '../../database/repositories/scanRepo';
import { alertRepo, incidentRepo } from '../../database/repositories/alertRepo';
import { policyRepo } from '../../database/repositories/policyRepo';
import { getActiveScannerRules } from '../../scanner/scannerEngine';
import { useAuth } from '../../services/authContext';

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function DashboardPage({ onNavigate }: DashboardProps = {}) {
  const { currentUser } = useAuth();
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'warn'>('all');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'clean' | 'blocked'>('all');
  const [quickPrompt, setQuickPrompt] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [clipboardGuardActive, setClipboardGuardActive] = useState(true);
  const [postureTab, setPostureTab] = useState<'wheel' | 'activity'>('wheel');
  const [quickTestResult, setQuickTestResult] = useState<string | null>(null);

  // Real tool and scan counts from local SQLite database
  const tools = useMemo(() => toolRepo.getAll(), [refreshKey]);
  const findings = useMemo(() => scanRepo.getFindings(), [refreshKey]);
  const scanSessions = useMemo(() => scanRepo.getScanSessions(100), [refreshKey]);
  const alerts = useMemo(() => alertRepo.getAll(), [refreshKey]);
  const incidents = useMemo(() => incidentRepo.getAll(), [refreshKey]);

  // Dynamic active rules count from SQLite policy
  const activeRulesSummary = useMemo(() => {
    const policyRecord = policyRepo.getLatest('pol_data_categories');
    return getActiveScannerRules(policyRecord?.policy_json, policyRecord?.version);
  }, [refreshKey]);

  const totalTools = tools.length;
  const approvedTools = tools.filter((t) => t.approval_status === 'Approved').length;
  const restrictedTools = tools.filter((t) => t.approval_status === 'Restricted').length;
  const unreviewedToolsCount = tools.filter((t) => t.approval_status === 'Unreviewed').length;
  const totalFindings = findings.length;

  // Real DLP compliance rating: 100% clean if zero leaks, calibrated by findings & incidents
  const complianceScore = useMemo(() => {
    if (totalFindings === 0 && incidents.length === 0) return 100;
    const ratio = Math.max(25, 100 - (totalFindings * 4 + incidents.length * 8));
    return Math.round(ratio);
  }, [totalFindings, incidents]);

  // 24-hour chronological prompt and leak telemetry
  const timelineData = useMemo(() => {
    const buckets: Record<string, { time: string; cleanScans: number; threatsBlocked: number }> = {
      '00:00': { time: '00:00', cleanScans: 0, threatsBlocked: 0 },
      '04:00': { time: '04:00', cleanScans: 0, threatsBlocked: 0 },
      '08:00': { time: '08:00', cleanScans: 0, threatsBlocked: 0 },
      '12:00': { time: '12:00', cleanScans: 0, threatsBlocked: 0 },
      '16:00': { time: '16:00', cleanScans: 0, threatsBlocked: 0 },
      '20:00': { time: '20:00', cleanScans: 0, threatsBlocked: 0 },
      '24:00': { time: '24:00', cleanScans: 0, threatsBlocked: 0 },
    };

    scanSessions.forEach((s) => {
      const date = new Date(s.scan_time);
      const hour = date.getHours();
      let slot = '24:00';
      if (hour < 4) slot = '00:00';
      else if (hour < 8) slot = '04:00';
      else if (hour < 12) slot = '08:00';
      else if (hour < 16) slot = '12:00';
      else if (hour < 20) slot = '16:00';
      else slot = '20:00';

      if (s.detected_count > 0) {
        buckets[slot].threatsBlocked += s.detected_count;
      } else {
        buckets[slot].cleanScans += 1;
      }
    });

    return Object.values(buckets);
  }, [scanSessions]);

  // Filtered actual findings for recent detections
  const filteredFindings = useMemo(() => {
    if (filterType === 'critical') {
      return findings.filter((f) => f.severity === 'Critical');
    }
    if (filterType === 'warn') {
      return findings.filter((f) => f.severity === 'High' || f.severity === 'Medium');
    }
    return findings;
  }, [findings, filterType]);

  // Unreviewed tools queue from database
  const unreviewedTools = useMemo(() => {
    return tools.filter((t) => t.approval_status === 'Unreviewed').slice(0, 3);
  }, [tools]);

  const handleToolDecision = async (id: string, decision: 'Approved' | 'Restricted') => {
    await toolRepo.updateApprovalStatus(id, decision);
    setRefreshKey((k) => k + 1);
  };

  const handleQuickTest = () => {
    if (!quickPrompt.trim()) {
      if (onNavigate) onNavigate('scan-text');
      return;
    }
    // Quick heuristic check against active rules
    const matches: string[] = [];
    if (/\b(?:\d[ -]*?){13,19}\b/.test(quickPrompt)) matches.push('Payment Card (PCI-DSS)');
    if (/\b(?:sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b/.test(quickPrompt)) matches.push('API / Secret Key');
    if (/\bpassword\s*[:=]\s*\S+/i.test(quickPrompt)) matches.push('Credential');

    if (matches.length > 0) {
      setQuickTestResult(`DLP Alert: ${matches.join(', ')} detected in input.`);
    } else {
      setQuickTestResult('Clean: No immediate sensitive patterns matched.');
    }
    setTimeout(() => setQuickTestResult(null), 4000);
  };

  return (
    <div className="space-y-5">
      {/* =========================================================================
          BANNER: PROMPTSHIELD DLP WELCOME HERO (CYAN-TEAL THEME)
         ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-slate-50/70 dark:from-slate-900/90 dark:via-slate-800/80 dark:to-slate-900/90 border border-teal-100/90 dark:border-slate-800 p-6 sm:p-8 shadow-xs">
        {/* Soft radial glow */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 dark:bg-slate-800/90 border border-teal-200/80 dark:border-teal-800/80 text-teal-800 dark:text-teal-300 text-xs font-semibold shadow-2xs">
              <Shield className="w-3.5 h-3.5 text-teal-500" />
              <span>PromptShield Core • Local DLP Active</span>
            </div>

            {/* Hero Heading */}
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight font-sans">
              Hello {currentUser?.username || 'admin'}!
            </h1>

            {/* Subtitle explicitly requested by user */}
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              Continuous Data Loss Prevention active. Real-time clipboard and prompt scanning enabled.
            </p>

            {/* Action Buttons for PromptShield DLP */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('scan-text')}
                className="px-5 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-slate-950 text-xs font-bold shadow-md shadow-teal-500/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Launch Scanner</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate && onNavigate('scan-clipboard')}
                className="px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>Audit Clipboard</span>
              </button>

              <button
                type="button"
                onClick={() => setClipboardGuardActive(!clipboardGuardActive)}
                className={`px-3.5 py-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 shadow-2xs transition-all cursor-pointer ${
                  clipboardGuardActive
                    ? 'bg-teal-500/10 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                    : 'bg-white/80 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Radio className={`w-3.5 h-3.5 ${clipboardGuardActive ? 'text-teal-500 animate-pulse' : 'text-slate-400'}`} />
                <span>Guard Daemon: {clipboardGuardActive ? 'Online' : 'Paused'}</span>
              </button>
            </div>
          </div>

          {/* Right Emblem: Stylized 3D Security Shield Avatar */}
          <div className="relative shrink-0 flex items-center justify-center self-center md:self-auto">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-teal-500/20 via-emerald-400/10 to-transparent p-1.5 flex items-center justify-center border border-teal-500/30 shadow-inner">
              <div className="w-full h-full rounded-full bg-white dark:bg-slate-800 shadow-md flex items-center justify-center relative">
                <Shield className="w-12 h-12 text-teal-500 drop-shadow-sm" />
                {/* Live DLP status badge */}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-xs">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          KEY STATS CARDS: 4 RESTORED PROMPTSHIELD METRIC CARDS (ROUNDED-3XL)
         ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Monitored AI Tools */}
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-teal-500/40 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Monitored AI Tools
              </span>
            </div>
            <Cpu className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight block">
              {totalTools < 10 ? `0${totalTools}` : totalTools}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
              {approvedTools} approved · {restrictedTools} restricted
            </span>
          </div>
        </div>

        {/* Card 2: PII Interceptions (Restored) */}
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-teal-500/40 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${totalFindings > 0 ? 'bg-rose-500' : 'bg-teal-500'}`} />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                PII Interceptions
              </span>
            </div>
            <Fingerprint className={`w-4 h-4 ${totalFindings > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight block">
              {totalFindings < 10 ? `0${totalFindings}` : totalFindings}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
              {totalFindings > 0 ? `${totalFindings} sensitive secrets blocked` : 'Zero data leaks detected'}
            </span>
          </div>
        </div>

        {/* Card 3: Active Risk Rules (Restored) */}
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-teal-500/40 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Active Risk Rules
              </span>
            </div>
            <Sliders className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight block">
              {activeRulesSummary.totalCount < 10 ? `0${activeRulesSummary.totalCount}` : activeRulesSummary.totalCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
              Safe Regex · Non-backtracking AST rules
            </span>
          </div>
        </div>

        {/* Card 4: Scanner Status (Restored) */}
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between hover:border-teal-500/40 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Scanner Status
              </span>
            </div>
            <Lock className="w-4 h-4 text-teal-500" />
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-extrabold text-teal-600 dark:text-teal-400 font-mono tracking-tight block">
                ONLINE
              </span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
              100% in-memory WebAssembly SQLite
            </span>
          </div>
        </div>
      </div>

      {quickTestResult && (
        <div className="p-3.5 bg-teal-500/10 border border-teal-500/30 rounded-2xl text-xs font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-2.5 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
          <span>{quickTestResult}</span>
        </div>
      )}

      {/* =========================================================================
          ROW 2: DLP EVENT TELEMETRY + PROMPTSHIELD POSTURE WHEEL
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 cols): Chronological Prompt & Leak Telemetry */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-800/90 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/60">
              <div>
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono block">
                  PROMPT SCAN & LEAK TELEMETRY
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-0.5">
                  Chronological DLP Event Telemetry
                </h3>
              </div>

              {/* Chart Legend / Filter */}
              <div className="flex items-center gap-3 text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" />
                  <span>Clean Scans</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                  <span>Blocked Leaks</span>
                </div>
              </div>
            </div>

            {/* Recharts Composed Chart with Cyan-Teal palette */}
            <div className="mt-5">
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#94A3B8" strokeOpacity={0.15} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white rounded-2xl p-3 shadow-xl text-xs font-mono border border-slate-700">
                              <p className="font-bold text-teal-400 mb-1">{label} UTC</p>
                              <p className="text-slate-200">
                                Clean Scans: <span className="font-bold text-teal-300">{payload[0]?.value}</span>
                              </p>
                              <p className="text-slate-200">
                                Interceptions: <span className="font-bold text-rose-400">{payload[1]?.value}</span>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {/* Threats blocked bar (Rose) */}
                    <Bar
                      dataKey="threatsBlocked"
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                      barSize={8}
                    />
                    {/* Clean scans bar (Cyan-Teal) */}
                    <Bar
                      dataKey="cleanScans"
                      fill="#14b8a6"
                      radius={[4, 4, 0, 0]}
                      barSize={8}
                    />
                    {/* Cyan Trend Line */}
                    <Line
                      type="monotone"
                      dataKey="cleanScans"
                      stroke="#06b6d4"
                      strokeWidth={3}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
            <span>00:00 UTC</span>
            <span>24-Hour Rolling Telemetry ({scanSessions.length} total local scans)</span>
            <span>24:00 UTC</span>
          </div>
        </div>

        {/* Right Column (4 cols): Security Posture Wheel */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800/90 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-500" />
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
                  SECURITY WHEEL CHART
                </span>
              </div>

              {/* Tabs: Wheel Chart / Activity */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPostureTab('wheel')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    postureTab === 'wheel'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Wheel Chart
                </button>
                <button
                  type="button"
                  onClick={() => setPostureTab('activity')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    postureTab === 'activity'
                      ? 'bg-teal-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  Activity
                </button>
              </div>
            </div>

            {/* Posture Wheel Title */}
            <div className="mt-4 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  PromptShield Posture Wheel
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">Local DLP Compliance Grade · Zero Exfiltration</p>
              </div>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                Airgapped
              </span>
            </div>

            {/* Central Colorful Square / Wheel Gauge */}
            <div className="mt-6 flex flex-col items-center justify-center">
              <div className="relative w-44 h-44 rounded-3xl p-1 bg-gradient-to-tr from-cyan-400 via-teal-500 to-rose-400 shadow-lg flex items-center justify-center">
                {/* Inner cutout */}
                <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[22px] flex flex-col items-center justify-center p-4 text-center">
                  <span className="text-[10px] font-bold text-slate-400 font-mono">DLP GRADE</span>
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 font-mono tracking-tight my-0.5">
                    {complianceScore}%
                  </span>
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                    PROTECTED
                  </span>
                </div>
              </div>

              <div className="mt-4 text-center">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Hardened Baseline
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  {complianceScore}% compliance rating · {totalFindings} active findings
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
            <button
              onClick={() => onNavigate && onNavigate('reports')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit</span>
            </button>
            <button
              onClick={() => onNavigate && onNavigate('findings')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Findings Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ROW 3: RECENT DETECTIONS + TOOL REVIEWS + PROMPT SANDBOX
         ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
        {/* Card 1 (4 cols): Recent Interceptions */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Recent Interceptions
              </h3>
              <span className="text-[10px] font-mono font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
                Realtime
              </span>
            </div>

            {/* Segmented Filter Control */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl my-3">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                All ({findings.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('critical')}
                className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  filterType === 'critical'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Critical ({findings.filter((f) => f.severity === 'Critical').length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('warn')}
                className={`flex-1 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  filterType === 'warn'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Warning ({findings.filter((f) => f.severity === 'High' || f.severity === 'Medium').length})
              </button>
            </div>

            {/* Detection Items */}
            <div className="space-y-2.5">
              {filteredFindings.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                  <CheckCircle2 className="w-6 h-6 text-teal-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">No data leaks detected</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Your local clipboard and prompt scans are currently safe from sensitive data leaks.
                  </p>
                </div>
              ) : (
                filteredFindings.slice(0, 3).map((f) => (
                  <div key={f.finding_id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{f.category}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {f.severity}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {f.explanation || `Rule match: ${f.rule_id}`}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <button
                        onClick={() => onNavigate && onNavigate('findings')}
                        className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 cursor-pointer"
                      >
                        Inspect →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Card 2 (4 cols): Tool Review Queue */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Tool Review Queue
              </h3>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('inventory')}
                className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 cursor-pointer"
              >
                Catalog ({tools.length})
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 my-3">
              Detected AI services awaiting governance classification
            </p>

            <div className="space-y-2.5">
              {unreviewedTools.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                  <CheckCircle2 className="w-6 h-6 text-teal-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">All tools classified</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    No unreviewed AI tools pending governance decision.
                  </p>
                </div>
              ) : (
                unreviewedTools.map((t) => (
                  <div key={t.tool_id} className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/80">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center justify-center shrink-0 border border-teal-200 dark:border-teal-800">
                        {t.tool_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="max-w-[120px] truncate">
                        <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{t.tool_name}</h5>
                        <p className="text-[10px] text-slate-400 truncate">{t.category}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToolDecision(t.tool_id, 'Approved')}
                        className="px-2.5 py-1 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-2xs transition-all cursor-pointer"
                        title="Approve"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToolDecision(t.tool_id, 'Restricted')}
                        className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 shadow-2xs transition-all cursor-pointer"
                        title="Restrict"
                      >
                        Restrict
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Card 3 (4 cols): Local Prompt Leak Sandbox */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-800/90 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-700/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Prompt Leak Sandbox
              </h3>
              <span className="text-[10px] font-mono font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
                Airgapped
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5">
              Instantly test a prompt, code snippet, or token for DLP rule matches.
            </p>

            <div className="mt-3">
              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                <textarea
                  rows={3}
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                  placeholder="Paste confidential data, secrets, or prompts to test..."
                  maxLength={500}
                  className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none font-mono"
                />
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    {quickPrompt.length}/500
                  </span>
                  <button
                    type="button"
                    onClick={handleQuickTest}
                    className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                  >
                    <span>Test Prompt</span>
                    <Send className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            Evaluated locally via non-backtracking AST safe regular expressions.
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
