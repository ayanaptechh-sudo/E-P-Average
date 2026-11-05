/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Electron IPC Types Definition
 */

import { DeviceItem, AgentCommand } from './device';

export interface ElectronAPI {
  getDevices: () => Promise<DeviceItem[]>;
  addDevice: (device: DeviceItem) => Promise<DeviceItem>;
  updateDevice: (id: string, updates: Partial<DeviceItem>) => Promise<DeviceItem | null>;
  deleteDevice: (id: string) => Promise<boolean>;
  queueCommand: (agentId: string, command: string, payload?: any) => Promise<{ status: string; commandId: string }>;
  getPendingCommands: (agentId: string) => Promise<AgentCommand[]>;
  getDaemonStatus: () => Promise<{ running: boolean; intervalMs: number; blockedEventsCount: number }>;
  uninstallAgent: (agentId: string) => Promise<{ status: string; commandId: string; state?: string }>;
  onAgentConnected: (callback: (data: { agentId: string; status: 'active' | 'Active'; device?: DeviceItem }) => void) => () => void;
  onTelemetryReceived: (callback: (data: any) => void) => () => void;
  onClipboardLeakBlocked: (callback: (data: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
