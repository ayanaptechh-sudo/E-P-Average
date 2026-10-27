/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../services/authContext';
import { incidentRepo, alertRepo } from '../../database/repositories/alertRepo';
import { userRepo, auditRepo } from '../../database/repositories/userRepo';
import {
  Incident,
  IncidentStatus,
  IncidentPriority,
  TimelineEventType,
} from '../../database/types';
import { DataTable, Column, Modal } from '../components/DataTable';
import { RiskBadge } from '../components/CommonUI';
import { incidentService } from '../../core/incidentService';
import {
  generateIncidentReportData,
  generateIncidentReportHtml,
  generateIncidentReportPdf,
  exportReportFile,
} from '../../reports/reportGenerator';

export const IncidentsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [incidents, setIncidents] = useState(() => incidentRepo.getAll());
  const [selectedIncident, setSelectedIncident] = useState<
    (Incident & { username?: string; assigned_name?: string }) | null
  >(null);
  const [timeline, setTimeline] = useState<ReturnType<typeof incidentRepo.getTimeline>>([]);

  const users = useMemo(() => userRepo.getAll(), []);

  // Create Incident Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<IncidentPriority>('Medium');
  const [newUserId, setNewUserId] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newSummary, setNewSummary] = useState('');

  // Add Timeline Event Modal State
  const [isAddTimelineModalOpen, setIsAddTimelineModalOpen] = useState(false);
  const [eventType, setEventType] = useState<TimelineEventType>('Review');
  const [eventDesc, setEventDesc] = useState('');

  const reload = () => {
    setIncidents(incidentRepo.getAll());
    if (selectedIncident) {
      const refreshed = incidentRepo.getById(selectedIncident.incident_id);
      if (refreshed) {
        setSelectedIncident(refreshed);
        setTimeline(incidentRepo.getTimeline(refreshed.incident_id));
      }
    }
  };

  const handleSelectIncident = (inc: Incident & { username?: string; assigned_name?: string }) => {
    setSelectedIncident(inc);
    setTimeline(incidentRepo.getTimeline(inc.incident_id));
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentUser) return;

    const created = await incidentService.createIncident({
      title: newTitle,
      user_id: newUserId || currentUser.user_id,
      priority: newPriority,
      assigned_to: newAssignedTo || currentUser.user_id,
      summary: newSummary,
      opened_by: currentUser.username,
    });

    setIsCreateModalOpen(false);
    setNewTitle('');
    setNewSummary('');
    reload();
    handleSelectIncident(created);
  };

  const handleUpdateStatus = async (status: IncidentStatus) => {
    if (!selectedIncident || !currentUser) return;
    await incidentService.updateIncident(
      selectedIncident.incident_id,
      { status },
      currentUser.username
    );
    reload();
  };

  const handleAddTimelineEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncident || !eventDesc.trim() || !currentUser) return;

    await incidentService.addTimelineEvent({
      incident_id: selectedIncident.incident_id,
      event_type: eventType,
      description: eventDesc,
      recorded_by: currentUser.username,
    });

    setIsAddTimelineModalOpen(false);
    setEventDesc('');
    reload();
  };

  const handleExportReport = async (format: 'html' | 'pdf') => {
    if (!selectedIncident || !currentUser) return;

    const reportData = generateIncidentReportData(selectedIncident.incident_id);
    if (!reportData) return;

    const fileName = `PromptShield-Incident-${selectedIncident.incident_number}.${format}`;

    if (format === 'html') {
      const html = generateIncidentReportHtml(reportData);
      await exportReportFile({
        reportType: 'Incident Summary',
        fileName,
        format: 'html',
        content: html,
        generatedByUserId: currentUser.user_id,
        incidentId: selectedIncident.incident_id,
      });
    } else {
      const pdfBytes = generateIncidentReportPdf(reportData);
      await exportReportFile({
        reportType: 'Incident Summary',
        fileName,
        format: 'pdf',
        content: pdfBytes,
        generatedByUserId: currentUser.user_id,
        incidentId: selectedIncident.incident_id,
      });
    }
  };

  const columns: Column<Incident & { username?: string; assigned_name?: string }>[] = [
    {
      header: 'Incident ID',
      accessor: (inc) => (
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
          {inc.incident_number}
        </span>
      ),
      sortable: true,
      sortValue: (inc) => inc.incident_number,
    },
    {
      header: 'Title',
      accessor: (inc) => (
        <div>
          <div className="font-bold text-gray-900 dark:text-slate-100 text-xs">{inc.title}</div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 line-clamp-1">{inc.summary}</div>
        </div>
      ),
      sortable: true,
      sortValue: (inc) => inc.title,
    },
    {
      header: 'Priority',
      accessor: (inc) => <RiskBadge level={inc.priority} size="sm" />,
      sortable: true,
      sortValue: (inc) => inc.priority,
    },
    {
      header: 'Status',
      accessor: (inc) => (
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            inc.status === 'Open'
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/80'
              : inc.status === 'Closed'
              ? 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 border-gray-300 dark:border-slate-600'
              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/80'
          }`}
        >
          {inc.status}
        </span>
      ),
    },
    {
      header: 'Target User',
      accessor: (inc) => (
        <span className="text-gray-800 dark:text-slate-200 font-medium">
          {inc.username || inc.user_id.slice(0, 8)}
        </span>
      ),
    },
    {
      header: 'Assigned',
      accessor: (inc) => inc.assigned_name ? <span className="font-medium text-gray-800 dark:text-slate-200">{inc.assigned_name}</span> : <span className="text-gray-400 dark:text-slate-500 italic">Unassigned</span>,
    },
    {
      header: 'Opened',
      accessor: (inc) => (
        <span className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
          {new Date(inc.opened_at).toLocaleDateString()}
        </span>
      ),
      sortable: true,
      sortValue: (inc) => inc.opened_at,
    },
    {
      header: 'Action',
      align: 'right',
      accessor: (inc) => (
        <button
          onClick={() => handleSelectIncident(inc)}
          className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg border border-indigo-200/80 dark:border-indigo-800 transition-colors cursor-pointer"
        >
          View Dossier &rarr;
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
            Security Incidents & Evidence Timeline
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
            Formal investigation cases with strict separation of scan vs attempted vs confirmed transmission evidence
          </p>
        </div>

        <button
          onClick={() => {
            setNewTitle('');
            setNewSummary('');
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 self-start cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Open New Incident</span>
        </button>
      </div>

      {/* Incident Detail Drawer / Panel if Selected */}
      {selectedIncident && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200/90 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xs mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-150 dark:border-slate-700 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-extrabold text-[#5B4DFB] dark:text-indigo-400">
                  {selectedIncident.incident_number}
                </span>
                <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                  {selectedIncident.title}
                </h2>
                <RiskBadge level={selectedIncident.priority} size="sm" />
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400 mt-1 font-medium">
                <span>User: <strong className="text-gray-800 dark:text-slate-200">{selectedIncident.username}</strong></span>
                <span>Assigned: <strong className="text-gray-800 dark:text-slate-200">{selectedIncident.assigned_name || 'Unassigned'}</strong></span>
                <span>Opened: <strong className="text-gray-800 dark:text-slate-200">{new Date(selectedIncident.opened_at).toLocaleDateString()}</strong></span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedIncident.status}
                onChange={(e) => handleUpdateStatus(e.target.value as IncidentStatus)}
                className="px-3 py-1.5 text-xs font-bold bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-800 dark:text-slate-200 cursor-pointer shadow-2xs"
              >
                <option value="Open">Status: Open</option>
                <option value="In Progress">Status: In Progress</option>
                <option value="On Hold">Status: On Hold</option>
                <option value="Closed">Status: Closed</option>
              </select>

              <button
                onClick={() => setIsAddTimelineModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                + Add Timeline Event
              </button>

              <button
                onClick={() => handleExportReport('pdf')}
                className="px-3.5 py-1.5 text-xs font-bold text-[#5B4DFB] dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
              >
                Export PDF
              </button>

              <button
                onClick={() => handleExportReport('html')}
                className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer"
              >
                Export HTML
              </button>

              <button
                onClick={() => setSelectedIncident(null)}
                className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-1">
              Case Summary & Context
            </h4>
            <p className="text-xs text-gray-800 dark:text-slate-200 bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-700 leading-relaxed font-medium">
              {selectedIncident.summary}
            </p>
          </div>

          {/* Chronological Timeline */}
          <div className="mt-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-3">
              Audited Chronological Timeline ({timeline.length} events)
            </h4>

            <div className="p-3.5 bg-blue-50/80 dark:bg-indigo-950/30 border border-blue-200 dark:border-indigo-900/50 rounded-xl text-xs text-blue-900 dark:text-indigo-200 mb-4">
              <strong>Evidence Invariant:</strong> The timeline rigorously distinguishes <em>Scan</em> vs <em>Attempted Submission</em> vs <em>Confirmed Submission</em>. No transmission is inferred unless corroborated by network endpoint logs.
            </div>

            <div className="space-y-3">
              {timeline.map((item, idx) => (
                <div
                  key={item.timeline_id}
                  className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 text-xs"
                >
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-[#5B4DFB] dark:text-indigo-400 flex items-center justify-center text-[10px] font-mono shrink-0 font-bold">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 dark:text-slate-100">
                        {item.event_type}
                      </span>
                      <span className="font-mono text-[11px] text-gray-500 dark:text-slate-400">
                        {new Date(item.event_time).toISOString().replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>
                    <p className="text-gray-700 dark:text-slate-300 mt-1 leading-normal font-medium">
                      {item.description}
                    </p>
                    <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                      Recorded by: <span className="font-semibold text-gray-600 dark:text-slate-400">{item.recorded_by}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Incidents Table */}
      <DataTable
        columns={columns}
        data={incidents}
        keyField="incident_id"
        searchPlaceholder="Filter incidents by ID, title, summary, user..."
        searchFilter={(inc, q) =>
          inc.incident_number.toLowerCase().includes(q) ||
          inc.title.toLowerCase().includes(q) ||
          inc.summary.toLowerCase().includes(q) ||
          (inc.username || '').toLowerCase().includes(q)
        }
        emptyTitle="No incidents on record"
        emptySubtitle="Security incidents can be created manually or escalated from alerts and findings."
      />

      {/* Create Incident Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Open Security Incident Case"
        subtitle="Registers an official investigation case dossier with chronological audit logging."
      >
        <form onSubmit={handleCreateIncident} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Incident Title
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Unapproved Claude Prompting with Customer Database URI"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Priority
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as IncidentPriority)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Subject User
              </label>
              <select
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
              >
                <option value="">Current User ({currentUser?.username})</option>
                {users.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.username} ({u.department})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Assigned Investigator
            </label>
            <select
              value={newAssignedTo}
              onChange={(e) => setNewAssignedTo(e.target.value)}
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
            >
              <option value="">Assign to Me ({currentUser?.username})</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Executive Summary & Scope
            </label>
            <textarea
              rows={4}
              required
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              placeholder="Describe observation, workstation telemetry, and initial findings..."
              className="mt-1 w-full p-3 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Create Incident
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Timeline Entry Modal */}
      <Modal
        isOpen={isAddTimelineModalOpen}
        onClose={() => setIsAddTimelineModalOpen(false)}
        title="Add Chronological Timeline Event"
        subtitle="Record verified actions. Distinguish carefully between scans, warnings, and verified submissions."
      >
        <form onSubmit={handleAddTimelineEntry} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Event Classification
            </label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as TimelineEventType)}
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
            >
              <option value="Scan">Scan (Local client text scan performed)</option>
              <option value="Finding">Finding (Specific rule triggered)</option>
              <option value="Warning">Warning (DLP banner presented to user)</option>
              <option value="Redaction">Redaction (User previewed or copied sanitized text)</option>
              <option value="Attempted Submission">Attempted Submission (User clicked send or paste to tool)</option>
              <option value="Confirmed Submission">Confirmed Submission (Corroborated by proxy / network egress)</option>
              <option value="Review">Review (Investigator audit note)</option>
              <option value="Resolution">Resolution (Remediation confirmed / closed)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Event Description & Metadata
            </label>
            <textarea
              rows={3}
              required
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
              placeholder="e.g. Employee acknowledged warning and replaced credentials with redaction token."
              className="mt-1 w-full p-3 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsAddTimelineModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Append Timeline Record
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
