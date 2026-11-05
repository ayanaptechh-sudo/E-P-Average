/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield v2.5.0 - EDR Device & Telemetry Types
 */

export interface ProcessItem {
  pid: number;
  name: string;
  memoryMb: number;
  cpuPercent?: number;
  status: 'running' | 'sleeping' | 'terminated';
}

export interface AgentCommand {
  id: string;
  agentId: string;
  command: 'KILL_PROCESS' | 'ISOLATE_NETWORK' | 'RESTORE_NETWORK' | 'SET_FEATURES' | 'UNINSTALL_AGENT';
  payload?: Record<string, any>;
  createdAt: string;
  status: 'pending' | 'delivered' | 'executed';
}

export interface DeviceItem {
  id: string;
  name: string;
  os: string;
  ip: string;
  status: 'Active' | 'Pending' | 'Isolated';
  enrolledAt: string;
  lastSeen?: string;
  isolated?: boolean;
  clipboardMonitoring?: boolean;
  activeWindowMonitoring?: boolean;
  processes?: ProcessItem[];
}
