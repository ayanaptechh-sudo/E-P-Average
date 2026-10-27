/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../services/authContext';
import { scanRepo } from '../../database/repositories/scanRepo';
import { alertRepo } from '../../database/repositories/alertRepo';
import { incidentRepo } from '../../database/repositories/alertRepo';
import { userRepo, auditRepo } from '../../database/repositories/userRepo';
import { usageRepo } from '../../database/repositories/usageRepo';
import { Finding, FindingStatus, SeverityLevel, Alert, AlertStatus } from '../../database/types';
import { DataTable, Column, Modal } from '../components/DataTable';
import { RiskBadge } from '../components/CommonUI';
import { calculateRiskScore } from '../../core/riskScoreEngine';
import { incidentService } from '../../core/incidentService';
import { alertService } from '../../core/alertService';

export const FindingsPage: React.FC<{ onNavigateToIncidents?: () => void }> = ({ onNavigateToIncidents }) => {
  const { currentUser } = useAuth();
  const [findings, setFindings] = useState(() => scanRepo.getFindings());
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentSummary, setIncidentSummary] = useState('');
  const [incidentPriority, setIncidentPriority] = useState<SeverityLevel>('High');

  const reload = () => {
    setFindings(scanRepo.getFindings());
  };

  const handleStatusChange = async (findingId: string, newStatus: FindingStatus) => {
    await scanRepo.updateFindingStatus(findingId, newStatus);
    await auditRepo.log({
      user_id: currentUser?.user_id || 'system',
      action: 'FINDING_STATUS_CHANGED',
      target_type: 'finding',
      target_id: findingId,
      outcome: 'Success',
      details: `Finding status changed to ${newStatus}.`,
    });
    reload();
  };

  const handleEscalateToIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinding || !currentUser) return;

    await incidentService.createIncident({
      title: incidentTitle || `DLP Escalation: ${selectedFinding.category}`,
      user_id: selectedFinding.user_id,
      priority: incidentPriority,
      assigned_to: currentUser.user_id,
      summary: incidentSummary || `Escalated from finding [${selectedFinding.finding_id}]. Rule: ${selectedFinding.rule_id}, Category: ${selectedFinding.category}.`,
      opened_by: currentUser.username,
      initialFindingId: selectedFinding.finding_id,
    });

    await scanRepo.updateFindingStatus(selectedFinding.finding_id, 'Resolved');

    setIsEscalateModalOpen(false);
    setSelectedFinding(null);
    reload();
    if (onNavigateToIncidents) onNavigateToIncidents();
  };

  const columns: Column<Finding & { tool_name?: string; username?: string }>[] = [
    {
      header: 'Rule ID',
      accessor: (f) => (
        <span className="font-mono text-xs font-bold text-[#5B4DFB] dark:text-indigo-400">
          {f.rule_id}
        </span>
      ),
      sortable: true,
      sortValue: (f) => f.rule_id,
    },
    {
      header: 'Category',
      accessor: (f) => (
        <span className="font-bold text-gray-900 dark:text-slate-100 text-xs">{f.category}</span>
      ),
      sortable: true,
      sortValue: (f) => f.category,
    },
    {
      header: 'Severity',
      accessor: (f) => <RiskBadge level={f.severity} size="sm" />,
      sortable: true,
      sortValue: (f) => f.severity,
    },
    {
      header: 'Explanation & False-Positive Note',
      accessor: (f) => (
        <div className="max-w-md">
          <div className="text-xs text-gray-800 dark:text-slate-200 font-medium">{f.explanation}</div>
          {f.false_positive_note ? (
            <div className="text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/80 mt-1">
              <span className="font-bold">False-positive note:</span> {f.false_positive_note}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Matches',
      accessor: (f) => <span className="font-mono tabular-nums font-semibold text-gray-900 dark:text-slate-100">{f.match_count}</span>,
      align: 'right',
    },
    {
      header: 'Target AI Tool',
      accessor: (f) => f.tool_name ? <span className="font-semibold text-gray-800 dark:text-slate-200">{f.tool_name}</span> : <span className="text-gray-400 dark:text-slate-500 italic">Unspecified</span>,
    },
    {
      header: 'User',
      accessor: (f) => f.username ? <span className="text-gray-700 dark:text-slate-300 font-medium">{f.username}</span> : <span className="text-gray-400 dark:text-slate-500 font-mono text-[11px]">{f.user_id.slice(0, 8)}</span>,
    },
    {
      header: 'Action Taken',
      accessor: (f) => (
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200">
          {f.action_taken}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (f) => (
        <select
          value={f.status}
          onChange={(e) => handleStatusChange(f.finding_id, e.target.value as FindingStatus)}
          className="text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-1 focus:outline-none font-semibold text-gray-800 dark:text-slate-200 cursor-pointer shadow-2xs"
        >
          <option value="New">New</option>
          <option value="Reviewing">Reviewing</option>
          <option value="Resolved">Resolved</option>
          <option value="Dismissed">Dismissed</option>
        </select>
      ),
    },
    {
      header: 'Detected At',
      accessor: (f) => (
        <span className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
          {new Date(f.created_at).toISOString().replace('T', ' ').slice(0, 19)}
        </span>
      ),
      sortable: true,
      sortValue: (f) => f.created_at,
    },
    {
      header: 'Action',
      align: 'right',
      accessor: (f) => (
        <button
          onClick={() => {
            setSelectedFinding(f);
            setIncidentTitle(`DLP Escalation: ${f.category} exposure`);
            setIncidentSummary(`Escalated from finding [${f.finding_id}]. Rule ID: ${f.rule_id}. Explanation: ${f.explanation}`);
            setIncidentPriority(f.severity);
            setIsEscalateModalOpen(true);
          }}
          className="px-3 py-1.5 text-xs font-bold text-[#5B4DFB] dark:text-indigo-400 hover:text-[#4E3EF0] dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg border border-indigo-200/80 dark:border-indigo-800 transition-colors cursor-pointer"
        >
          Escalate
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
          DLP Findings & Detections
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
          Audited sensitive pattern records. In accordance with zero-leak privacy rules, no raw matched values are ever stored or displayed.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={findings}
        keyField="finding_id"
        searchPlaceholder="Filter findings by category, rule, tool, user..."
        searchFilter={(f, q) =>
          f.category.toLowerCase().includes(q) ||
          f.rule_id.toLowerCase().includes(q) ||
          (f.tool_name || '').toLowerCase().includes(q) ||
          (f.username || '').toLowerCase().includes(q) ||
          f.status.toLowerCase().includes(q)
        }
        emptyTitle="No findings recorded"
        emptySubtitle="Findings will appear as local prompt scans or imports identify sensitive pattern matches."
      />

      {/* Escalate to Incident Modal */}
      <Modal
        isOpen={isEscalateModalOpen}
        onClose={() => setIsEscalateModalOpen(false)}
        title="Escalate Finding to Formal Incident"
        subtitle="Opens a tracked security incident investigation dossier with chronological timeline verification."
      >
        <form onSubmit={handleEscalateToIncident} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Incident Title
            </label>
            <input
              type="text"
              required
              value={incidentTitle}
              onChange={(e) => setIncidentTitle(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Priority Level
              </label>
              <select
                value={incidentPriority}
                onChange={(e) => setIncidentPriority(e.target.value as SeverityLevel)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Investigation Summary & Scope
            </label>
            <textarea
              rows={4}
              required
              value={incidentSummary}
              onChange={(e) => setIncidentSummary(e.target.value)}
              className="mt-1 w-full p-3 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsEscalateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Create Incident
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const AlertsPage: React.FC<{ onNavigateToIncidents?: () => void }> = ({ onNavigateToIncidents }) => {
  const { currentUser } = useAuth();
  const [alerts, setAlerts] = useState(() => alertRepo.getAll());
  const users = useMemo(() => userRepo.getAll(), []);

  const reload = () => {
    setAlerts(alertRepo.getAll());
  };

  const handleStatusUpdate = async (alertId: string, status: AlertStatus, assignedTo?: string | null) => {
    if (!currentUser) return;
    await alertService.updateAlertStatus(alertId, status, currentUser.user_id, assignedTo);
    reload();
  };

  const handleEscalateAlert = async (alert: Alert) => {
    if (!currentUser) return;
    await incidentService.createIncident({
      title: `Escalated Alert: ${alert.title}`,
      user_id: alert.user_id,
      priority: alert.severity,
      assigned_to: currentUser.user_id,
      summary: `Escalated directly from alert [${alert.alert_id}]. Description: ${alert.description}`,
      opened_by: currentUser.username,
      initialFindingId: alert.finding_id,
    });
    await handleStatusUpdate(alert.alert_id, 'Resolved');
    if (onNavigateToIncidents) onNavigateToIncidents();
  };

  const columns: Column<Alert & { username?: string }>[] = [
    {
      header: 'Alert Title',
      accessor: (a) => (
        <div>
          <div className="font-bold text-gray-900 dark:text-slate-100 text-xs">{a.title}</div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{a.description}</div>
        </div>
      ),
      sortable: true,
      sortValue: (a) => a.title,
    },
    {
      header: 'Severity',
      accessor: (a) => <RiskBadge level={a.severity} size="sm" />,
      sortable: true,
      sortValue: (a) => a.severity,
    },
    {
      header: 'User',
      accessor: (a) => a.username ? <span className="text-gray-800 dark:text-slate-200 font-medium">{a.username}</span> : <span className="font-mono text-xs text-gray-400 dark:text-slate-500">{a.user_id.slice(0, 8)}</span>,
    },
    {
      header: 'Assigned To',
      accessor: (a) => (
        <select
          value={a.assigned_to || ''}
          onChange={(e) => handleStatusUpdate(a.alert_id, a.status, e.target.value || null)}
          className="text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-gray-800 dark:text-slate-200 font-semibold cursor-pointer shadow-2xs"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.username} ({u.role})
            </option>
          ))}
        </select>
      ),
    },
    {
      header: 'Status',
      accessor: (a) => (
        <select
          value={a.status}
          onChange={(e) => handleStatusUpdate(a.alert_id, e.target.value as AlertStatus, a.assigned_to)}
          className={`text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer shadow-2xs ${
            a.status === 'Open'
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/80'
              : a.status === 'Resolved' || a.status === 'Closed'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/80'
              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/80'
          }`}
        >
          <option value="Open">Open</option>
          <option value="Acknowledged">Acknowledged</option>
          <option value="Investigating">Investigating</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
      ),
    },
    {
      header: 'Generated',
      accessor: (a) => (
        <span className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
          {new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19)}
        </span>
      ),
      sortable: true,
      sortValue: (a) => a.created_at,
    },
    {
      header: 'Action',
      align: 'right',
      accessor: (a) => (
        <button
          onClick={() => handleEscalateAlert(a)}
          className="px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 rounded-lg border border-rose-200/80 dark:border-rose-800 transition-colors cursor-pointer"
        >
          Escalate to INC
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
          Active Security Alerts
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
          Triggered automatically from severity thresholds and restricted AI destination interactions
        </p>
      </div>

      <DataTable
        columns={columns}
        data={alerts}
        keyField="alert_id"
        searchPlaceholder="Filter alerts by title, metadata, user..."
        searchFilter={(a, q) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.status.toLowerCase().includes(q) ||
          (a.username || '').toLowerCase().includes(q)
        }
        emptyTitle="No alerts triggered"
        emptySubtitle="Alerts will appear when high/critical findings or policy violations occur."
      />
    </div>
  );
};

export const RiskAnalysisPage: React.FC = () => {
  const findings = useMemo(() => scanRepo.getFindings(), []);
  const usageEvents = useMemo(() => usageRepo.getAll(), []);
  const users = useMemo(() => userRepo.getAll(), []);

  const overallRisk = useMemo(() => {
    return calculateRiskScore({
      findings,
      usageEvents,
      windowDays: 30,
      hasBrowserIntegration: false,
    });
  }, [findings, usageEvents]);

  // Per user breakdown
  const userRisks = useMemo(() => {
    return users.map((u) => {
      const uFindings = findings.filter((f) => f.user_id === u.user_id);
      const uEvents = usageEvents.filter((e) => e.user_id === u.user_id);
      const res = calculateRiskScore({
        findings: uFindings,
        usageEvents: uEvents,
        windowDays: 30,
      });
      return {
        user: u,
        score: res.score,
        risk_level: res.risk_level,
        findingsCount: uFindings.length,
        eventsCount: uEvents.length,
        breakdown: res.breakdown,
      };
    }).sort((a, b) => b.score - a.score);
  }, [users, findings, usageEvents]);

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
          AI Risk Score Model & Exposure Index
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
          Formula: 30% sensitive findings + 25% tool approval + 20% repeated violations + 15% event context + 10% recency
        </p>
      </div>

      {/* Main Composite Score Display */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-150 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-4xl sm:text-5xl font-extrabold font-mono tracking-tight text-gray-900 dark:text-slate-100 tabular-nums">
                {overallRisk.score}
              </span>
              <span className="text-lg text-gray-400 dark:text-slate-500 font-mono font-medium">/ 100</span>
              <RiskBadge level={overallRisk.risk_level} size="md" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mt-2">
              Composite Organization Risk Index (Observation Period: {overallRisk.observationPeriod})
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-2xl leading-normal font-medium">
              {overallRisk.explanation}
            </p>
          </div>

          <div className="p-5 bg-gray-50 dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 min-w-64">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 mb-2.5">
              Risk Band Legend
            </div>
            <div className="space-y-2 text-xs font-mono font-semibold">
              <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-300">
                <span>0 – 24</span>
                <span className="bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded">Low</span>
              </div>
              <div className="flex justify-between items-center text-amber-700 dark:text-amber-300">
                <span>25 – 49</span>
                <span className="bg-amber-100/70 dark:bg-amber-950/60 px-2 py-0.5 rounded">Medium</span>
              </div>
              <div className="flex justify-between items-center text-orange-700 dark:text-orange-300">
                <span>50 – 74</span>
                <span className="bg-orange-100/70 dark:bg-orange-950/60 px-2 py-0.5 rounded">High</span>
              </div>
              <div className="flex justify-between items-center text-rose-700 dark:text-rose-300">
                <span>75 – 100</span>
                <span className="bg-rose-100/70 dark:bg-rose-950/60 px-2 py-0.5 rounded">Critical</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5-Component Normalized Factor Breakdown */}
        <div className="mt-6">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-4">
            Normalized Contributing Factors (Weighted)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-slate-400">Sensitive Findings (30%)</div>
              <div className="text-2xl font-extrabold font-mono text-gray-900 dark:text-slate-100 mt-1 tabular-nums">
                {overallRisk.breakdown.sensitiveDataScore}/100
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-slate-400">Tool Approval Policy (25%)</div>
              <div className="text-2xl font-extrabold font-mono text-gray-900 dark:text-slate-100 mt-1 tabular-nums">
                {overallRisk.breakdown.toolApprovalScore}/100
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-slate-400">Repeated Violations (20%)</div>
              <div className="text-2xl font-extrabold font-mono text-gray-900 dark:text-slate-100 mt-1 tabular-nums">
                {overallRisk.breakdown.repeatedViolationsScore}/100
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-slate-400">Event Context (15%)</div>
              <div className="text-2xl font-extrabold font-mono text-gray-900 dark:text-slate-100 mt-1 tabular-nums">
                {overallRisk.breakdown.eventContextScore}/100
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="text-[11px] font-semibold text-gray-600 dark:text-slate-400">Time-Decay Recency (10%)</div>
              <div className="text-2xl font-extrabold font-mono text-gray-900 dark:text-slate-100 mt-1 tabular-nums">
                {overallRisk.breakdown.recencyScore}/100
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-3 border-t border-gray-150 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 dark:text-slate-400 gap-2">
          <span>{overallRisk.disclaimer}</span>
          <span className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Dynamic re-weighting enabled for missing sources</span>
        </div>
      </div>

      {/* User Risk Breakdown Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200/80 dark:border-slate-700">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
            User Exposure Index Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-slate-900/60 text-gray-700 dark:text-slate-300 font-bold border-b border-gray-200/80 dark:border-slate-700">
                <th className="py-3 px-4 font-bold">User</th>
                <th className="py-3 px-4 font-bold">Department</th>
                <th className="py-3 px-4 font-bold">Risk Level</th>
                <th className="py-3 px-4 font-bold text-right">Risk Score</th>
                <th className="py-3 px-4 font-bold text-right">Findings</th>
                <th className="py-3 px-4 font-bold text-right">Usage Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60 text-gray-800 dark:text-slate-200">
              {userRisks.map((ur) => (
                <tr key={ur.user.user_id} className="hover:bg-gray-50/70 dark:hover:bg-slate-700/40 transition-colors">
                  <td className="py-3 px-4 font-bold text-gray-900 dark:text-slate-100">{ur.user.username}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-slate-400 font-medium">{ur.user.department}</td>
                  <td className="py-3 px-4"><RiskBadge level={ur.risk_level} size="sm" /></td>
                  <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-gray-900 dark:text-slate-100">{ur.score}/100</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-gray-600 dark:text-slate-400 font-semibold">{ur.findingsCount}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-gray-600 dark:text-slate-400 font-semibold">{ur.eventsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
