/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Enterprise DLP / EDR v2.5.0 - Electron Main Process & Background Daemon
 * 100% Local Enterprise EDR: Persistent Storage, Local Command Queue, and Telemetry Server.
 */

import { app, BrowserWindow, clipboard, Notification, ipcMain } from 'electron';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ESM path resolution polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 0. GLOBAL PROCESS ERROR & CRASH HANDLERS
// ============================================================================

process.on('uncaughtException', (error: any) => {
  console.error('\n================ [PromptShield] UNCAUGHT EXCEPTION ================');
  console.error('Message:', error?.message || error);
  if (error?.stack) {
    console.error('Stack:\n', error.stack);
  }
  console.error('==================================================================\n');
});

process.on('unhandledRejection', (reason: any, promise: any) => {
  console.error('\n================ [PromptShield] UNHANDLED REJECTION ===============');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('==================================================================\n');
});

// ============================================================================
// 1. DATA TYPES & SENSITIVE PATTERNS
// ============================================================================

export interface ProcessItem {
  pid: number;
  name: string;
  memoryMb: number;
  cpuPercent?: number;
  status: 'running' | 'sleeping' | 'terminated';
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

export interface AgentCommand {
  id: string;
  agentId: string;
  command: 'KILL_PROCESS' | 'ISOLATE_NETWORK' | 'RESTORE_NETWORK' | 'SET_FEATURES' | 'UNINSTALL_AGENT' | string;
  payload?: Record<string, any>;
  createdAt: string;
  status: 'pending' | 'delivered' | 'executed';
}

export const BLOCKED_CLIPBOARD_TEXT = '[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]';
export const CLIPBOARD_CHECK_INTERVAL_MS = 1000;

export interface SensitivePattern {
  id: string;
  name: string;
  category: string;
  regex: RegExp;
  description: string;
}

export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    id: 'rule_credit_card',
    name: 'Payment Card Number',
    category: 'Financial Data (PCI-DSS)',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    description: 'Visa, MasterCard, American Express, or Discover primary account numbers.',
  },
  {
    id: 'rule_openai_key',
    name: 'OpenAI Secret Key',
    category: 'API Credentials',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
    description: 'OpenAI platform secret key or project token.',
  },
  {
    id: 'rule_anthropic_key',
    name: 'Anthropic Claude API Key',
    category: 'API Credentials',
    regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/,
    description: 'Anthropic Claude API secret key.',
  },
  {
    id: 'rule_github_pat',
    name: 'GitHub Access Token',
    category: 'Source Control & CI/CD',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/,
    description: 'GitHub personal access token or fine-grained repo token.',
  },
  {
    id: 'rule_aws_access_key',
    name: 'AWS Access Key ID',
    category: 'Cloud Credentials',
    regex: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
    description: 'Amazon Web Services 20-character IAM access key.',
  },
  {
    id: 'rule_slack_token',
    name: 'Slack OAuth Token',
    category: 'API Credentials',
    regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/,
    description: 'Slack bot, app, or user authentication token.',
  },
  {
    id: 'rule_google_api_key',
    name: 'Google Cloud API Key',
    category: 'Cloud Credentials',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    description: 'Google Cloud Platform API key identifier.',
  },
  {
    id: 'rule_private_key',
    name: 'Private Cryptographic Key',
    category: 'PKI & Certificates',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    description: 'Unencrypted PEM private cryptographic key header.',
  },
  {
    id: 'rule_us_ssn',
    name: 'US Social Security Number',
    category: 'PII (Government ID)',
    regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    description: 'US Social Security 9-digit hyphenated format.',
  },
  {
    id: 'rule_database_uri',
    name: 'Database Connection URI',
    category: 'Infrastructure Credentials',
    regex: /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s:]+:[^\s@]+@[^\s\/]+/i,
    description: 'Direct database connection URI containing embedded username and password.',
  },
];

// ============================================================================
// 2. PERSISTENT LOCAL DATABASE (File-backed with Atomic Flush)
// ============================================================================

const DEFAULT_PROCESSES: ProcessItem[] = [
  { pid: 1420, name: 'promptshield-agent.exe', memoryMb: 42.4, cpuPercent: 0.8, status: 'running' },
  { pid: 3892, name: 'powershell.exe', memoryMb: 68.1, cpuPercent: 0.2, status: 'running' },
  { pid: 5120, name: 'chrome.exe', memoryMb: 340.5, cpuPercent: 3.4, status: 'running' },
  { pid: 6104, name: 'teams.exe', memoryMb: 195.2, cpuPercent: 1.1, status: 'running' },
  { pid: 884, name: 'svchost.exe', memoryMb: 24.8, cpuPercent: 0.1, status: 'running' },
  { pid: 1042, name: 'explorer.exe', memoryMb: 112.0, cpuPercent: 0.5, status: 'running' },
];

const DEFAULT_INITIAL_DEVICES: DeviceItem[] = [
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
    processes: DEFAULT_PROCESSES,
  },
];

class LocalDeviceDatabase {
  private dbFilePath: string;
  private devices: Map<string, DeviceItem> = new Map();

  constructor() {
    this.dbFilePath = this.resolveDbPath();
    this.loadFromDisk();
  }

  private resolveDbPath(): string {
    try {
      if (app && typeof app.getPath === 'function') {
        const userData = app.getPath('userData');
        return path.join(userData, 'promptshield_devices.json');
      }
    } catch {}

    const localDataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(localDataDir)) {
      try {
        fs.mkdirSync(localDataDir, { recursive: true });
      } catch {}
    }
    return path.join(localDataDir, 'promptshield_devices.json');
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const list: DeviceItem[] = JSON.parse(raw || '[]');
        if (Array.isArray(list) && list.length > 0) {
          list.forEach((d) => this.devices.set(d.id, d));
          console.log(`[LocalDeviceDatabase] Loaded ${this.devices.size} device(s) from ${this.dbFilePath}`);
          return;
        }
      }
    } catch (err) {
      console.warn('[LocalDeviceDatabase] Failed loading devices from disk, seeding defaults:', err);
    }

    // Seed default device
    DEFAULT_INITIAL_DEVICES.forEach((d) => this.devices.set(d.id, d));
    this.saveToDisk();
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const list = Array.from(this.devices.values());
      const tempPath = `${this.dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbFilePath);
    } catch (err) {
      console.error('[LocalDeviceDatabase] Error saving devices to disk:', err);
    }
  }

  public getAll(): DeviceItem[] {
    return Array.from(this.devices.values());
  }

  public getById(id: string): DeviceItem | undefined {
    return this.devices.get(id);
  }

  public add(device: DeviceItem): DeviceItem {
    const enriched: DeviceItem = {
      ...device,
      processes: device.processes || DEFAULT_PROCESSES,
      clipboardMonitoring: device.clipboardMonitoring ?? true,
      activeWindowMonitoring: device.activeWindowMonitoring ?? true,
      isolated: device.isolated ?? false,
      lastSeen: new Date().toISOString(),
    };
    this.devices.set(enriched.id, enriched);
    this.saveToDisk();
    console.log(`[LocalDeviceDatabase] Added device ${enriched.name} (${enriched.id})`);
    return enriched;
  }

  public update(id: string, updates: Partial<DeviceItem>): DeviceItem | null {
    const existing = this.devices.get(id);
    if (!existing) return null;

    const updated: DeviceItem = {
      ...existing,
      ...updates,
      lastSeen: new Date().toISOString(),
    };
    this.devices.set(id, updated);
    this.saveToDisk();
    console.log(`[LocalDeviceDatabase] Updated device ${id}`);
    return updated;
  }

  public delete(id: string): boolean {
    const existed = this.devices.delete(id);
    if (existed) {
      this.saveToDisk();
      console.log(`[LocalDeviceDatabase] Deleted device ${id}`);
    }
    return existed;
  }
}

const deviceDb = new LocalDeviceDatabase();

// ============================================================================
// 3. AGENT COMMAND QUEUE (Local EDR Dispatch)
// ============================================================================

class CommandQueueManager {
  private queue: Map<string, AgentCommand[]> = new Map();

  public enqueue(agentId: string, command: string, payload?: Record<string, any>): AgentCommand {
    const cmd: AgentCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      command,
      payload,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    const existing = this.queue.get(agentId) || [];
    existing.push(cmd);
    this.queue.set(agentId, existing);
    console.log(`[CommandQueue] Enqueued command "${command}" for agent ${agentId} (ID: ${cmd.id})`);
    return cmd;
  }

  public fetchAndDrain(agentId: string): AgentCommand[] {
    const list = this.queue.get(agentId) || [];
    if (list.length > 0) {
      this.queue.set(agentId, []); // drain queue
      console.log(`[CommandQueue] Drained ${list.length} command(s) for agent ${agentId}`);
    }
    return list;
  }

  public peek(agentId: string): AgentCommand[] {
    return this.queue.get(agentId) || [];
  }
}

const commandQueue = new CommandQueueManager();

// ============================================================================
// 4. BACKGROUND CLIPBOARD DAEMON
// ============================================================================

let clipboardMonitorInterval: NodeJS.Timeout | null = null;
let lastScannedText = '';
let totalBlockedEventsCount = 0;
let mainWindow: BrowserWindow | null = null;

export function triggerOsAlert(patternName: string, category: string): void {
  try {
    if (!Notification.isSupported()) return;

    new Notification({
      title: 'PromptShield DLP Security Alert',
      body: `Sensitive ${category} (${patternName}) detected on system clipboard. Content blocked automatically.`,
      urgency: 'critical',
      silent: false,
    }).show();
  } catch (err) {
    console.error('[PromptShield Daemon] Failed to display notification:', err);
  }
}

export function checkSensitivePatterns(text: string): SensitivePattern | null {
  if (!text || typeof text !== 'string') return null;

  for (const pattern of SENSITIVE_PATTERNS) {
    try {
      if (pattern.regex.test(text)) {
        return pattern;
      }
    } catch {}
  }
  return null;
}

export function monitorClipboardTick(): void {
  try {
    const rawText = (typeof clipboard?.readText === 'function' ? clipboard.readText() : '') as unknown;
    const currentText = typeof rawText === 'string' ? rawText : '';

    if (!currentText || currentText === lastScannedText || currentText === BLOCKED_CLIPBOARD_TEXT) {
      return;
    }

    lastScannedText = currentText;
    const match = checkSensitivePatterns(currentText);

    if (match) {
      try {
        clipboard.writeText(BLOCKED_CLIPBOARD_TEXT);
      } catch {}
      lastScannedText = BLOCKED_CLIPBOARD_TEXT;
      totalBlockedEventsCount++;

      console.warn(`[PromptShield Daemon] BLOCKED sensitive clipboard: ${match.name} [${match.category}]`);
      triggerOsAlert(match.name, match.category);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('clipboard-leak-blocked', {
          timestamp: new Date().toISOString(),
          ruleId: match.id,
          patternName: match.name,
          category: match.category,
          totalBlockedCount: totalBlockedEventsCount,
        });
      }
    }
  } catch (err) {
    console.error('[PromptShield Daemon] Error checking clipboard:', err);
  }
}

export function startClipboardDaemon(): void {
  try {
    if (clipboardMonitorInterval) clearInterval(clipboardMonitorInterval);
    const raw = (typeof clipboard?.readText === 'function' ? clipboard.readText() : '') as unknown;
    lastScannedText = typeof raw === 'string' ? raw : '';
    clipboardMonitorInterval = setInterval(monitorClipboardTick, CLIPBOARD_CHECK_INTERVAL_MS);
    console.log('[PromptShield Daemon] Background clipboard monitor active.');
  } catch (err) {
    console.error('[PromptShield Daemon] Failed starting clipboard monitor:', err);
  }
}

export function stopClipboardDaemon(): void {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
    console.log('[PromptShield Daemon] Background clipboard monitor stopped.');
  }
}

// ============================================================================
// 5. ELECTRON BROWSER WINDOW INITIALIZATION
// ============================================================================

function createMainWindow(): BrowserWindow | null {
  try {
    const preloadPathCjs = path.join(__dirname, 'preload.cjs');
    const preloadPathJs = path.join(__dirname, 'preload.js');
    const effectivePreload = fs.existsSync(preloadPathCjs)
      ? preloadPathCjs
      : fs.existsSync(preloadPathJs)
      ? preloadPathJs
      : undefined;

    mainWindow = new BrowserWindow({
      width: 1366,
      height: 880,
      minWidth: 1080,
      minHeight: 720,
      title: 'PromptShield v2.5.0 • 100% Local Enterprise EDR',
      backgroundColor: '#0B1017',
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: effectivePreload,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      console.log('[PromptShield Main Process] Main window visible.');
    });

    const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL || 'http://localhost:3000';
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      console.log(`[PromptShield Main Process] Connecting to dev server: ${devServerUrl}`);
      mainWindow.loadURL(devServerUrl).catch((err) => {
        console.error(`[PromptShield Main Process] Failed loading URL ${devServerUrl}:`, err);
      });
    } else {
      const prodPath = path.join(__dirname, '../dist/index.html');
      if (fs.existsSync(prodPath)) {
        mainWindow.loadFile(prodPath).catch((err) => {
          console.error(`[PromptShield Main Process] Failed loading prod index:`, err);
        });
      } else {
        mainWindow.loadURL(devServerUrl).catch((err) => {
          console.error(`[PromptShield Main Process] Fallback dev URL failed:`, err);
        });
      }
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    return mainWindow;
  } catch (err) {
    console.error('[PromptShield Main Process] CRITICAL ERROR creating window:', err);
    return null;
  }
}

// ============================================================================
// 6. LOCAL HTTP TELEMETRY & COMMAND QUEUE SERVER (Port 8000)
// ============================================================================

let localHttpServer: http.Server | null = null;
export const LOCAL_SERVER_PORT = 8000;

export function startLocalTelemetryServer(): http.Server | null {
  if (localHttpServer) return localHttpServer;

  console.log(`[PromptShield Server] Starting local HTTP server on 0.0.0.0:${LOCAL_SERVER_PORT}...`);

  try {
    localHttpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = req.url || '';

      // Route 1: Serve PowerShell Agent Script
      if (req.method === 'GET' && url.startsWith('/agent/install.ps1')) {
        const psPath = path.join(__dirname, '../public/agent/install.ps1');
        if (fs.existsSync(psPath)) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          fs.createReadStream(psPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Agent script not found');
        }
        return;
      }

      // Route 2: Serve POSIX Bash Agent Script
      if (req.method === 'GET' && url.startsWith('/agent/install.sh')) {
        const shPath = path.join(__dirname, '../public/agent/install.sh');
        if (fs.existsSync(shPath)) {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          fs.createReadStream(shPath).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Agent script not found');
        }
        return;
      }

      // Route 3: Queue Command for Agent (POST /api/agent/:id/command)
      const commandMatch = url.match(/^\/api\/agent\/([^/]+)\/command$/);
      if (req.method === 'POST' && commandMatch) {
        const agentId = decodeURIComponent(commandMatch[1]);
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const { command, payload } = parsed;
            if (!command) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Command field is required' }));
              return;
            }

            const queued = commandQueue.enqueue(agentId, command, payload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', commandId: queued.id, queued: true }));
          } catch (pErr) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // Route 4: Agent Heartbeat Fetch Pending Commands (GET /api/agent/:id/pending-commands)
      const pendingMatch = url.match(/^\/api\/agent\/([^/]+)\/pending-commands$/);
      if (req.method === 'GET' && pendingMatch) {
        const agentId = decodeURIComponent(pendingMatch[1]);
        const commands = commandQueue.fetchAndDrain(agentId);

        // Update agent lastSeen in local database
        deviceDb.update(agentId, { lastSeen: new Date().toISOString() });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          agentId,
          count: commands.length,
          commands,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // Route 5: Endpoint Telemetry Ingestion (POST /api/endpoints/telemetry)
      if (req.method === 'POST' && url === '/api/endpoints/telemetry') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const telemetryData = JSON.parse(body || '{}');
            console.log(`[PromptShield Server] Telemetry received from: ${telemetryData.hostname || 'Unknown host'}`);

            // Auto-update device or register if needed
            if (telemetryData.agentId || telemetryData.hostname) {
              const id = telemetryData.agentId || telemetryData.hostname;
              const existing = deviceDb.getById(id);
              if (existing) {
                deviceDb.update(id, {
                  ip: telemetryData.ip || existing.ip,
                  lastSeen: new Date().toISOString(),
                  processes: telemetryData.processes || existing.processes,
                });
              }
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('telemetry-received', telemetryData);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', message: 'Telemetry received' }));
          } catch (parseErr) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // Route 6: Health Check
      if (req.method === 'GET' && (url === '/api/health' || url === '/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          service: 'PromptShield Local Enterprise EDR Server',
          port: LOCAL_SERVER_PORT,
          enrolledDevices: deviceDb.getAll().length,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    localHttpServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n[PromptShield Server] CRITICAL PORT CONFLICT! Port ${LOCAL_SERVER_PORT} is in use.`);
      } else {
        console.error(`[PromptShield Server] Socket error on port ${LOCAL_SERVER_PORT}:`, err);
      }
    });

    localHttpServer.listen(LOCAL_SERVER_PORT, '0.0.0.0', () => {
      console.log(`\n================================================================`);
      console.log(`[PromptShield Server] Local HTTP Telemetry Server ACTIVE & LISTENING`);
      console.log(`  -> URL:              http://0.0.0.0:${LOCAL_SERVER_PORT}`);
      console.log(`  -> Health:           http://127.0.0.1:${LOCAL_SERVER_PORT}/api/health`);
      console.log(`  -> Command Queue:    POST http://0.0.0.0:${LOCAL_SERVER_PORT}/api/agent/:id/command`);
      console.log(`  -> Pending Commands: GET  http://0.0.0.0:${LOCAL_SERVER_PORT}/api/agent/:id/pending-commands`);
      console.log(`================================================================\n`);
    });

    return localHttpServer;
  } catch (err) {
    console.error(`[PromptShield Server] FATAL ERROR creating server on port ${LOCAL_SERVER_PORT}:`, err);
    return null;
  }
}

function stopLocalTelemetryServer(): void {
  if (localHttpServer) {
    try {
      localHttpServer.close();
    } catch {}
    localHttpServer = null;
  }
}

// ============================================================================
// 7. IPC HANDLERS & APPLICATION LIFECYCLE
// ============================================================================

console.log('[PromptShield Main Process] Bootstrapping local EDR subsystems...');

// Start telemetry server immediately on Port 8000
startLocalTelemetryServer();

// Register IPC handlers
function registerIpcHandlers(): void {
  // Device Persistence Handlers
  ipcMain.handle('get-devices', async () => {
    try {
      return deviceDb.getAll();
    } catch (err) {
      console.error('[IPC] get-devices error:', err);
      return [];
    }
  });

  ipcMain.handle('add-device', async (_event, device: DeviceItem) => {
    try {
      return deviceDb.add(device);
    } catch (err) {
      console.error('[IPC] add-device error:', err);
      return device;
    }
  });

  ipcMain.handle('update-device', async (_event, id: string, updates: Partial<DeviceItem>) => {
    try {
      return deviceDb.update(id, updates);
    } catch (err) {
      console.error('[IPC] update-device error:', err);
      return null;
    }
  });

  ipcMain.handle('delete-device', async (_event, id: string) => {
    try {
      return deviceDb.delete(id);
    } catch (err) {
      console.error('[IPC] delete-device error:', err);
      return false;
    }
  });

  // EDR Command Queue Handlers
  ipcMain.handle('queue-agent-command', async (_event, agentId: string, command: string, payload?: any) => {
    try {
      const queued = commandQueue.enqueue(agentId, command, payload);
      return { status: 'success', commandId: queued.id };
    } catch (err) {
      console.error('[IPC] queue-agent-command error:', err);
      return { status: 'error', commandId: '' };
    }
  });

  ipcMain.handle('get-pending-commands', async (_event, agentId: string) => {
    try {
      return commandQueue.peek(agentId);
    } catch (err) {
      console.error('[IPC] get-pending-commands error:', err);
      return [];
    }
  });

  // Daemon Status Handlers
  ipcMain.handle('get-daemon-status', () => ({
    running: clipboardMonitorInterval !== null,
    intervalMs: CLIPBOARD_CHECK_INTERVAL_MS,
    blockedEventsCount: totalBlockedEventsCount,
  }));

  ipcMain.handle('toggle-daemon', (_event, enabled: boolean) => {
    if (enabled) {
      startClipboardDaemon();
    } else {
      stopClipboardDaemon();
    }
    return { running: clipboardMonitorInterval !== null };
  });
}

registerIpcHandlers();

app.whenReady()
  .then(() => {
    console.log('[PromptShield Main Process] Electron app.whenReady() resolved. Creating window...');
    createMainWindow();
    startClipboardDaemon();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch((err) => {
    console.error('[PromptShield Main Process] CRITICAL: app.whenReady() rejected:', err);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  console.log('[PromptShield Main Process] Shutting down application...');
  stopClipboardDaemon();
  stopLocalTelemetryServer();
});
