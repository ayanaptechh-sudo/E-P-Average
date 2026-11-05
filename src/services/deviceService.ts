/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield v2.5.0 - EDR Device Service
 * Defensive client layer with Electron IPC + LocalStorage persistence fallback.
 */

import { DeviceItem, AgentCommand, ProcessItem } from '../types/device';

const STORAGE_KEY = 'promptshield_enrolled_devices_v2';
const COMMAND_QUEUE_KEY = 'promptshield_command_queue_v2';

export const INITIAL_DEFAULT_PROCESSES: ProcessItem[] = [
  { pid: 1420, name: 'promptshield-agent.exe', memoryMb: 42.4, cpuPercent: 0.8, status: 'running' },
  { pid: 3892, name: 'powershell.exe', memoryMb: 68.1, cpuPercent: 0.2, status: 'running' },
  { pid: 5120, name: 'chrome.exe', memoryMb: 340.5, cpuPercent: 3.4, status: 'running' },
  { pid: 6104, name: 'teams.exe', memoryMb: 195.2, cpuPercent: 1.1, status: 'running' },
  { pid: 884, name: 'svchost.exe', memoryMb: 24.8, cpuPercent: 0.1, status: 'running' },
  { pid: 1042, name: 'explorer.exe', memoryMb: 112.0, cpuPercent: 0.5, status: 'running' },
];

export const INITIAL_DEVICES: DeviceItem[] = [
  {
    id: 'dev_finance_07',
    name: 'FINANCE-LAPTOP-07',
    os: 'Windows 11 (10.0.22631)',
    ip: '192.168.1.107',
    status: 'Active',
    enrolledAt: 'Synchronized',
    lastSeen: 'Just now',
    isolated: false,
    clipboardMonitoring: true,
    activeWindowMonitoring: true,
    processes: INITIAL_DEFAULT_PROCESSES,
  },
];

/**
 * Reads local fallback devices from localStorage
 */
function getLocalFallback(): DeviceItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEVICES));
      return INITIAL_DEVICES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_DEVICES;
  } catch (err) {
    console.warn('[DeviceService] Failed reading localStorage fallback:', err);
    return INITIAL_DEVICES;
  }
}

/**
 * Writes local fallback devices to localStorage
 */
function setLocalFallback(devices: DeviceItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
  } catch (err) {
    console.warn('[DeviceService] Failed writing to localStorage fallback:', err);
  }
}

export const deviceService = {
  /**
   * Fetches all enrolled devices from the persistent local database.
   */
  async getDevices(): Promise<DeviceItem[]> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.getDevices) {
        const devices = await window.electronAPI.getDevices();
        if (Array.isArray(devices) && devices.length > 0) {
          setLocalFallback(devices);
          return devices;
        }
      }
    } catch (err) {
      console.error('[DeviceService] Electron IPC getDevices error, using local fallback:', err);
    }
    return getLocalFallback();
  },

  /**
   * Adds a new enrolled device.
   */
  async addDevice(device: DeviceItem): Promise<DeviceItem> {
    const enrichedDevice: DeviceItem = {
      ...device,
      processes: device.processes || INITIAL_DEFAULT_PROCESSES,
      clipboardMonitoring: device.clipboardMonitoring ?? true,
      activeWindowMonitoring: device.activeWindowMonitoring ?? true,
      isolated: device.isolated ?? false,
    };

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.addDevice) {
        const result = await window.electronAPI.addDevice(enrichedDevice);
        if (result) {
          const current = getLocalFallback();
          setLocalFallback([result, ...current.filter((d) => d.id !== result.id)]);
          return result;
        }
      }
    } catch (err) {
      console.error('[DeviceService] Electron IPC addDevice error, using local fallback:', err);
    }

    const current = getLocalFallback();
    const updated = [enrichedDevice, ...current.filter((d) => d.id !== enrichedDevice.id)];
    setLocalFallback(updated);
    return enrichedDevice;
  },

  /**
   * Updates an existing device.
   */
  async updateDevice(id: string, updates: Partial<DeviceItem>): Promise<DeviceItem | null> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.updateDevice) {
        const result = await window.electronAPI.updateDevice(id, updates);
        if (result) {
          const current = getLocalFallback();
          setLocalFallback(current.map((d) => (d.id === id ? { ...d, ...updates } : d)));
          return result;
        }
      }
    } catch (err) {
      console.error('[DeviceService] Electron IPC updateDevice error, using local fallback:', err);
    }

    const current = getLocalFallback();
    let updatedDevice: DeviceItem | null = null;
    const next = current.map((d) => {
      if (d.id === id) {
        updatedDevice = { ...d, ...updates };
        return updatedDevice;
      }
      return d;
    });
    setLocalFallback(next);
    return updatedDevice;
  },

  /**
   * Deletes an enrolled device.
   */
  async deleteDevice(id: string): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.deleteDevice) {
        const success = await window.electronAPI.deleteDevice(id);
        const current = getLocalFallback();
        setLocalFallback(current.filter((d) => d.id !== id));
        return success;
      }
    } catch (err) {
      console.error('[DeviceService] Electron IPC deleteDevice error, using local fallback:', err);
    }

    const current = getLocalFallback();
    setLocalFallback(current.filter((d) => d.id !== id));
    return true;
  },

  /**
   * Triggers agent self-delete / uninstall.
   * Sends request to backend (IPC or POST /api/agent/:id/uninstall) to queue uninstall command.
   */
  async uninstallAgent(agentId: string): Promise<{ status: string; commandId: string; state?: string }> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.uninstallAgent) {
        return await window.electronAPI.uninstallAgent(agentId);
      }
    } catch (err) {
      console.warn('[DeviceService] Electron IPC uninstallAgent failed, trying HTTP route:', err);
    }

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/agent/${encodeURIComponent(agentId)}/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (httpErr) {
      console.warn('[DeviceService] HTTP uninstall route fallback failed:', httpErr);
    }

    // Local queue fallback
    return await this.queueCommand(agentId, 'UNINSTALL_AGENT', {
      action: 'self_delete',
      status: 'pending_uninstall',
      manualRemovalPath: 'C:\\Windows\\Temp\\PromptShield\\',
    });
  },

  /**
   * Queues an agent command (kill process, isolate, feature toggle, self-destruct).
   */
  async queueCommand(agentId: string, command: AgentCommand['command'], payload?: Record<string, any>): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.queueCommand) {
        return await window.electronAPI.queueCommand(agentId, command, payload);
      }
    } catch (err) {
      console.error('[DeviceService] Electron IPC queueCommand error, using local fallback:', err);
    }

    // Local fallback for command queue
    try {
      const raw = localStorage.getItem(COMMAND_QUEUE_KEY);
      const queue: AgentCommand[] = raw ? JSON.parse(raw) : [];
      const newCmd: AgentCommand = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        command,
        payload,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      queue.push(newCmd);
      localStorage.setItem(COMMAND_QUEUE_KEY, JSON.stringify(queue));
      return { status: 'success', commandId: newCmd.id, queued: true };
    } catch {
      return { status: 'success', commandId: `cmd_${Date.now()}`, queued: true };
    }
  },

  /**
   * Retrieves pending commands for an agent.
   */
  async getPendingCommands(agentId: string): Promise<AgentCommand[]> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.getPendingCommands) {
        return await window.electronAPI.getPendingCommands(agentId);
      }
    } catch (err) {
      console.error('[DeviceService] Electron IPC getPendingCommands error:', err);
    }

    try {
      const raw = localStorage.getItem(COMMAND_QUEUE_KEY);
      const queue: AgentCommand[] = raw ? JSON.parse(raw) : [];
      return queue.filter((c) => c.agentId === agentId && c.status === 'pending');
    } catch {
      return [];
    }
  },
};
