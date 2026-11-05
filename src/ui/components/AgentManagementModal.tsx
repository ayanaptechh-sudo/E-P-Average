/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield v2.5.0 - Agent Management Modal (EDR Admin Settings)
 * Process Explorer, Task Termination, Network Lockdown, Feature Controls, and Self-Destruct.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Trash2,
  Lock,
  Unlock,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  Radio,
  Zap,
  Copy,
  Check,
} from 'lucide-react';
import { DeviceItem, ProcessItem, AgentCommand } from '../../types/device';
import { deviceService } from '../../services/deviceService';

interface AgentManagementModalProps {
  device: DeviceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDeviceUpdated: (updatedDevice: DeviceItem) => void;
  onDeviceDeleted: (deletedId: string) => void;
}

export function AgentManagementModal({
  device,
  isOpen,
  onClose,
  onDeviceUpdated,
  onDeviceDeleted,
}: AgentManagementModalProps) {
  if (!isOpen || !device) return null;

  const [processes, setProcesses] = useState<ProcessItem[]>(device.processes || []);
  const [pidInput, setPidInput] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [isIsolated, setIsIsolated] = useState(device.isolated ?? (device.status === 'Isolated'));
  const [clipboardMonitoring, setClipboardMonitoring] = useState(device.clipboardMonitoring ?? true);
  const [activeWindowMonitoring, setActiveWindowMonitoring] = useState(device.activeWindowMonitoring ?? true);
  const [pendingCommands, setPendingCommands] = useState<AgentCommand[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' | 'error' } | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (device) {
      setProcesses(device.processes || []);
      setIsIsolated(device.isolated ?? (device.status === 'Isolated'));
      setClipboardMonitoring(device.clipboardMonitoring ?? true);
      setActiveWindowMonitoring(device.activeWindowMonitoring ?? true);
      loadPendingCommands();
    }
  }, [device]);

  const loadPendingCommands = async () => {
    if (!device) return;
    try {
      const cmds = await deviceService.getPendingCommands(device.id);
      setPendingCommands(cmds);
    } catch (err) {
      console.warn('[AgentModal] Failed to load pending commands:', err);
    }
  };

  const showNotification = (text: string, type: 'success' | 'warn' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // 1. Terminate Task (Kill by PID)
  const handleKillPid = async (targetPid?: number) => {
    const pid = targetPid !== undefined ? targetPid : parseInt(pidInput.trim(), 10);
    if (isNaN(pid) || pid <= 0) {
      showNotification('Please enter a valid numeric PID.', 'warn');
      return;
    }

    setIsBusy(true);
    try {
      // Queue command for agent
      await deviceService.queueCommand(device.id, 'KILL_PROCESS', { pid });

      // Update local process table
      const updatedProcesses = processes.map((p) =>
        p.pid === pid ? { ...p, status: 'terminated' as const } : p
      );
      setProcesses(updatedProcesses);

      // Persist to local database
      const updatedDevice: DeviceItem = {
        ...device,
        processes: updatedProcesses,
      };
      await deviceService.updateDevice(device.id, { processes: updatedProcesses });
      onDeviceUpdated(updatedDevice);

      setPidInput('');
      showNotification(`Task termination queued: SIGKILL PID ${pid}`, 'success');
      loadPendingCommands();
    } catch (err) {
      console.error('[AgentModal] Error killing PID:', err);
      showNotification('Failed to queue process termination command.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // 2. Network Lockdown (Isolate Agent)
  const handleToggleIsolation = async () => {
    const nextIsolation = !isIsolated;
    setIsBusy(true);
    try {
      const newStatus = nextIsolation ? ('Isolated' as const) : ('Active' as const);
      await deviceService.queueCommand(
        device.id,
        nextIsolation ? 'ISOLATE_NETWORK' : 'RESTORE_NETWORK',
        { isolated: nextIsolation }
      );

      const updated = await deviceService.updateDevice(device.id, {
        isolated: nextIsolation,
        status: newStatus,
      });

      setIsIsolated(nextIsolation);
      if (updated) {
        onDeviceUpdated(updated);
      }

      showNotification(
        nextIsolation
          ? 'Lockdown Engaged: Agent isolated from LAN. Only Port 8000 telemetry allowed.'
          : 'Lockdown Disengaged: Normal network connectivity restored.',
        nextIsolation ? 'warn' : 'success'
      );
      loadPendingCommands();
    } catch (err) {
      console.error('[AgentModal] Error toggling lockdown:', err);
      showNotification('Failed to update isolation state.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // 3. Feature Controls (Clipboard & Active Window)
  const handleToggleFeature = async (feature: 'clipboard' | 'activeWindow') => {
    const nextClipboard = feature === 'clipboard' ? !clipboardMonitoring : clipboardMonitoring;
    const nextWindow = feature === 'activeWindow' ? !activeWindowMonitoring : activeWindowMonitoring;

    setIsBusy(true);
    try {
      await deviceService.queueCommand(device.id, 'SET_FEATURES', {
        clipboardMonitoring: nextClipboard,
        activeWindowMonitoring: nextWindow,
      });

      const updated = await deviceService.updateDevice(device.id, {
        clipboardMonitoring: nextClipboard,
        activeWindowMonitoring: nextWindow,
      });

      if (feature === 'clipboard') setClipboardMonitoring(nextClipboard);
      if (feature === 'activeWindow') setActiveWindowMonitoring(nextWindow);

      if (updated) onDeviceUpdated(updated);
      showNotification('Agent feature configuration queued successfully.', 'success');
      loadPendingCommands();
    } catch (err) {
      console.error('[AgentModal] Error toggling feature:', err);
      showNotification('Failed to update feature settings.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const [pathCopied, setPathCopied] = useState(false);
  const manualRemovalPath = 'C:\\Windows\\Temp\\PromptShield\\';

  const handleCopyPath = () => {
    try {
      navigator.clipboard.writeText(manualRemovalPath);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2500);
    } catch {
      showNotification('Failed to copy path', 'warn');
    }
  };

  // Trigger Agent Self-Delete (Uninstall) via backend API/IPC
  const handleTriggerUninstall = async () => {
    setIsBusy(true);
    try {
      const res = await deviceService.uninstallAgent(device.id);
      showNotification(
        `Agent self-delete command queued in local database (status: ${res.state || 'pending_uninstall'}). Endpoint will execute removal on next heartbeat.`,
        'success'
      );
      await loadPendingCommands();
    } catch (err) {
      console.error('[AgentModal] Error queueing uninstall command:', err);
      showNotification('Failed to queue agent uninstall command.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  // Optional: Console-level purge & wipe
  const handleSelfDestruct = async () => {
    if (!confirmUninstall) {
      setConfirmUninstall(true);
      return;
    }

    setIsBusy(true);
    try {
      await deviceService.uninstallAgent(device.id);
      await deviceService.deleteDevice(device.id);
      onDeviceDeleted(device.id);
      onClose();
    } catch (err) {
      console.error('[AgentModal] Error during uninstall:', err);
      showNotification('Failed to execute self-destruct sequence.', 'error');
      setIsBusy(false);
    }
  };

  const filteredProcesses = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      p.pid.toString().includes(filterQuery)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#121B27] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 transition-colors">
        {/* ===================================================================
            HEADER: Device Identity & Status
           =================================================================== */}
        <div className="p-6 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-[#101721]/50">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                isIsolated
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-500 border-rose-300 dark:border-rose-800/60'
                  : 'bg-teal-50 dark:bg-teal-950/40 text-teal-500 border-teal-300 dark:border-teal-800/60'
              }`}
            >
              {isIsolated ? <ShieldAlert className="w-6 h-6 animate-pulse" /> : <Terminal className="w-6 h-6" />}
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold font-mono tracking-tight text-slate-900 dark:text-white">
                  {device.name}
                </h2>
                {isIsolated ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1.5 shadow-xs">
                    <Lock className="w-3 h-3" />
                    Isolated (Lockdown)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active Endpoint
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                {device.os} • IP: {device.ip} • Port 8000 Heartbeat: Managed
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ===================================================================
            FEEDBACK BANNER
           =================================================================== */}
        {feedbackMsg && (
          <div
            className={`px-6 py-2.5 text-xs font-medium flex items-center gap-2 border-b transition-all ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
                : feedbackMsg.type === 'warn'
                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/50'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900/50'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* ===================================================================
            MODAL BODY (Scrollable without visible bar)
           =================================================================== */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
          {/* Section 1: EDR Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Network Lockdown Card */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isIsolated
                  ? 'bg-rose-500/10 border-rose-500/30'
                  : 'bg-slate-50 dark:bg-[#101721] border-slate-200/80 dark:border-slate-800/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${isIsolated ? 'bg-rose-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                    {isIsolated ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                      Isolate Agent (Lockdown Mode)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Sever LAN sockets and quarantine host immediately.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleToggleIsolation}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isIsolated ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  role="switch"
                  aria-checked={isIsolated}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isIsolated ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {isIsolated && (
                <div className="mt-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>Agent traffic blocked. Local telemetry uplink to Port 8000 maintained.</span>
                </div>
              )}
            </div>

            {/* Feature Controls Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#101721] border border-slate-200/80 dark:border-slate-800/80 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                    Enable Clipboard Scanning
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Real-time regex AST inspection of client copy buffer.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleToggleFeature('clipboard')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    clipboardMonitoring ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                      clipboardMonitoring ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-800/70">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                    Enable Active Window Monitoring
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Detect AI tools (ChatGPT, Claude) in active focus.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleToggleFeature('activeWindow')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    activeWindowMonitoring ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                      activeWindowMonitoring ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Process Explorer & Terminate Task */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#101721]/50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                  Endpoint Process Explorer ({processes.length})
                </h3>
              </div>

              {/* Terminate Task: Input PID + Kill Task Button */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="number"
                    value={pidInput}
                    onChange={(e) => setPidInput(e.target.value)}
                    placeholder="Enter PID..."
                    className="w-28 sm:w-32 px-3 py-1.5 rounded-xl text-xs font-mono outline-none bg-white dark:bg-[#131B26] border border-slate-300 dark:border-slate-700 focus:border-rose-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={!pidInput.trim() || isBusy}
                  onClick={() => handleKillPid()}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kill Task</span>
                </button>
              </div>
            </div>

            {/* Filter Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter running processes by task name or PID..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs font-normal outline-none bg-white dark:bg-[#131B26] border border-slate-300/80 dark:border-slate-700/80 placeholder-slate-400"
              />
            </div>

            {/* Process Data Table */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-[#0D131B]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100/80 dark:bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3.5">Task Name</th>
                    <th className="py-2.5 px-3">PID</th>
                    <th className="py-2.5 px-3">RAM Usage</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                  {filteredProcesses.length > 0 ? (
                    filteredProcesses.map((proc) => {
                      const isTerminated = proc.status === 'terminated';
                      return (
                        <tr
                          key={proc.pid}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                            isTerminated ? 'opacity-40 line-through' : ''
                          }`}
                        >
                          <td className="py-2 px-3.5 font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                            <span>{proc.name}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{proc.pid}</td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{proc.memoryMb.toFixed(1)} MB</td>
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isTerminated
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              }`}
                            >
                              {proc.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {!isTerminated ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleKillPid(proc.pid)}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 cursor-pointer"
                              >
                                Terminate
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">Killed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 text-xs font-sans">
                        No processes match the query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Local Command Queue Status */}
          {pendingCommands.length > 0 && (
            <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/25 space-y-2">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300 font-mono text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>Queued Commands Awaiting Heartbeat Pull ({pendingCommands.length})</span>
              </div>
              <div className="space-y-1">
                {pendingCommands.map((cmd) => (
                  <div key={cmd.id} className="text-[11px] font-mono text-slate-600 dark:text-slate-300 flex items-center justify-between">
                    <span>
                      • <strong className="text-teal-600 dark:text-teal-400">{cmd.command}</strong>
                      {cmd.payload?.pid ? ` (PID: ${cmd.payload.pid})` : ''}
                    </span>
                    <span className="text-[10px] text-slate-400">{new Date(cmd.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Trigger Agent Self-Delete / Uninstall Danger Zone */}
          <div className="p-5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase font-mono text-rose-700 dark:text-rose-400">
                    Endpoint Agent Self-Delete & Uninstallation
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    Queue an agent self-delete command in the local database. The host will sanitize and wipe its payload on next heartbeat.
                  </p>
                </div>
              </div>

              {/* Requirement 2: Prominent Red Button labeled "Trigger Agent Self-Delete (Uninstall)" */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleTriggerUninstall}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-md transition-all cursor-pointer flex items-center gap-2 shrink-0 hover:scale-102 active:scale-98 disabled:opacity-50"
                  title="Queue self-delete command in local database"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Trigger Agent Self-Delete (Uninstall)</span>
                </button>
              </div>
            </div>

            {/* Requirement 3: Show Installation Path */}
            <div className="pt-3 border-t border-rose-200/60 dark:border-rose-900/40">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 font-mono mb-1.5 flex items-center justify-between">
                <span>Manual Removal Path</span>
                <span className="text-[10px] text-slate-400 font-sans normal-case">(For manual cleanup if agent goes offline)</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    readOnly
                    value={`Manual removal path: ${manualRemovalPath}`}
                    className="w-full px-3.5 py-2 text-xs font-mono bg-white dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none select-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="Copy path to clipboard"
                >
                  {pathCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copy Path</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-sans">
                If the endpoint is offline or disconnected, manually delete this directory on the target PC to purge the agent files.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#101721]/50 flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-400 font-mono text-[11px]">
            Device ID: {device.id} • 100% Local Enterprise EDR
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
}
