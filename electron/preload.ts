/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Enterprise EDR - Electron Preload Bridge
 * Exposes IPC handlers securely via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

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
  processes?: any[];
}

const electronAPI = {
  // Device Persistence Handlers
  getDevices: (): Promise<DeviceItem[]> => {
    return ipcRenderer.invoke('get-devices');
  },

  addDevice: (device: DeviceItem): Promise<DeviceItem> => {
    return ipcRenderer.invoke('add-device', device);
  },

  updateDevice: (id: string, updates: Partial<DeviceItem>): Promise<DeviceItem | null> => {
    return ipcRenderer.invoke('update-device', id, updates);
  },

  deleteDevice: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('delete-device', id);
  },

  // EDR Command Queue Handlers
  queueCommand: (agentId: string, command: string, payload?: any): Promise<{ status: string; commandId: string }> => {
    return ipcRenderer.invoke('queue-agent-command', agentId, command, payload);
  },

  getPendingCommands: (agentId: string): Promise<any[]> => {
    return ipcRenderer.invoke('get-pending-commands', agentId);
  },

  // Daemon Status
  getDaemonStatus: (): Promise<{ running: boolean; intervalMs: number; blockedEventsCount: number }> => {
    return ipcRenderer.invoke('get-daemon-status');
  },

  toggleDaemon: (enabled: boolean): Promise<{ running: boolean }> => {
    return ipcRenderer.invoke('toggle-daemon', enabled);
  },

  // Event Listeners
  onTelemetryReceived: (callback: (data: any) => void): (() => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('telemetry-received', handler);
    return () => {
      ipcRenderer.removeListener('telemetry-received', handler);
    };
  },

  onClipboardLeakBlocked: (callback: (data: any) => void): (() => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('clipboard-leak-blocked', handler);
    return () => {
      ipcRenderer.removeListener('clipboard-leak-blocked', handler);
    };
  },
};

// Expose safe API to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
