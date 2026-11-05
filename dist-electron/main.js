// electron/main.ts
import { app, BrowserWindow, clipboard, Notification, ipcMain } from "electron";
import * as path from "path";
import * as http from "http";
import * as fs from "fs";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
process.on("uncaughtException", (error) => {
  console.error("\n================ [PromptShield] UNCAUGHT EXCEPTION ================");
  console.error("Message:", error?.message || error);
  if (error?.stack) {
    console.error("Stack:\n", error.stack);
  }
  console.error("==================================================================\n");
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("\n================ [PromptShield] UNHANDLED REJECTION ===============");
  console.error("Promise:", promise);
  console.error("Reason:", reason);
  console.error("==================================================================\n");
});
var BLOCKED_CLIPBOARD_TEXT = "[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]";
var CLIPBOARD_CHECK_INTERVAL_MS = 1e3;
var SENSITIVE_PATTERNS = [
  {
    id: "rule_credit_card",
    name: "Payment Card Number",
    category: "Financial Data (PCI-DSS)",
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    description: "Visa, MasterCard, American Express, or Discover primary account numbers."
  },
  {
    id: "rule_openai_key",
    name: "OpenAI Secret Key",
    category: "API Credentials",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
    description: "OpenAI platform secret key or project token."
  },
  {
    id: "rule_anthropic_key",
    name: "Anthropic Claude API Key",
    category: "API Credentials",
    regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/,
    description: "Anthropic Claude API secret key."
  },
  {
    id: "rule_github_pat",
    name: "GitHub Access Token",
    category: "Source Control & CI/CD",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/,
    description: "GitHub personal access token or fine-grained repo token."
  },
  {
    id: "rule_aws_access_key",
    name: "AWS Access Key ID",
    category: "Cloud Credentials",
    regex: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
    description: "Amazon Web Services 20-character IAM access key."
  },
  {
    id: "rule_slack_token",
    name: "Slack OAuth Token",
    category: "API Credentials",
    regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/,
    description: "Slack bot, app, or user authentication token."
  },
  {
    id: "rule_google_api_key",
    name: "Google Cloud API Key",
    category: "Cloud Credentials",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    description: "Google Cloud Platform API key identifier."
  },
  {
    id: "rule_private_key",
    name: "Private Cryptographic Key",
    category: "PKI & Certificates",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    description: "Unencrypted PEM private cryptographic key header."
  },
  {
    id: "rule_us_ssn",
    name: "US Social Security Number",
    category: "PII (Government ID)",
    regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    description: "US Social Security 9-digit hyphenated format."
  },
  {
    id: "rule_database_uri",
    name: "Database Connection URI",
    category: "Infrastructure Credentials",
    regex: /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s:]+:[^\s@]+@[^\s\/]+/i,
    description: "Direct database connection URI containing embedded username and password."
  }
];
var DEFAULT_PROCESSES = [
  { pid: 1420, name: "promptshield-agent.exe", memoryMb: 42.4, cpuPercent: 0.8, status: "running" },
  { pid: 3892, name: "powershell.exe", memoryMb: 68.1, cpuPercent: 0.2, status: "running" },
  { pid: 5120, name: "chrome.exe", memoryMb: 340.5, cpuPercent: 3.4, status: "running" },
  { pid: 6104, name: "teams.exe", memoryMb: 195.2, cpuPercent: 1.1, status: "running" },
  { pid: 884, name: "svchost.exe", memoryMb: 24.8, cpuPercent: 0.1, status: "running" },
  { pid: 1042, name: "explorer.exe", memoryMb: 112, cpuPercent: 0.5, status: "running" }
];
var DEFAULT_INITIAL_DEVICES = [
  {
    id: "dev_finance_07",
    name: "FINANCE-LAPTOP-07",
    os: "Windows 11 (10.0.22631)",
    ip: "192.168.1.107",
    status: "Active",
    enrolledAt: "Synchronized",
    lastSeen: "Just now",
    isolated: false,
    clipboardMonitoring: true,
    activeWindowMonitoring: true,
    processes: DEFAULT_PROCESSES
  }
];
var LocalDeviceDatabase = class {
  constructor() {
    this.devices = /* @__PURE__ */ new Map();
    this.dbFilePath = this.resolveDbPath();
    this.loadFromDisk();
  }
  resolveDbPath() {
    try {
      if (app && typeof app.getPath === "function") {
        const userData = app.getPath("userData");
        return path.join(userData, "promptshield_devices.json");
      }
    } catch {
    }
    const localDataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(localDataDir)) {
      try {
        fs.mkdirSync(localDataDir, { recursive: true });
      } catch {
      }
    }
    return path.join(localDataDir, "promptshield_devices.json");
  }
  loadFromDisk() {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, "utf-8");
        const list = JSON.parse(raw || "[]");
        if (Array.isArray(list) && list.length > 0) {
          list.forEach((d) => this.devices.set(d.id, d));
          console.log(`[LocalDeviceDatabase] Loaded ${this.devices.size} device(s) from ${this.dbFilePath}`);
          return;
        }
      }
    } catch (err) {
      console.warn("[LocalDeviceDatabase] Failed loading devices from disk, seeding defaults:", err);
    }
    DEFAULT_INITIAL_DEVICES.forEach((d) => this.devices.set(d.id, d));
    this.saveToDisk();
  }
  saveToDisk() {
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const list = Array.from(this.devices.values());
      const tempPath = `${this.dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), "utf-8");
      fs.renameSync(tempPath, this.dbFilePath);
    } catch (err) {
      console.error("[LocalDeviceDatabase] Error saving devices to disk:", err);
    }
  }
  getAll() {
    return Array.from(this.devices.values());
  }
  getById(id) {
    return this.devices.get(id);
  }
  findDevice(identifier) {
    if (!identifier) return void 0;
    const direct = this.devices.get(identifier);
    if (direct) return direct;
    const clean = identifier.trim().toLowerCase();
    for (const d of this.devices.values()) {
      if (d.id.toLowerCase() === clean || d.name.toLowerCase() === clean) {
        return d;
      }
    }
    return void 0;
  }
  add(device) {
    const enriched = {
      ...device,
      processes: device.processes || DEFAULT_PROCESSES,
      clipboardMonitoring: device.clipboardMonitoring ?? true,
      activeWindowMonitoring: device.activeWindowMonitoring ?? true,
      isolated: device.isolated ?? false,
      lastSeen: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.devices.set(enriched.id, enriched);
    this.saveToDisk();
    console.log(`[LocalDeviceDatabase] Added device ${enriched.name} (${enriched.id})`);
    return enriched;
  }
  update(id, updates) {
    const existing = this.devices.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updates,
      lastSeen: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.devices.set(id, updated);
    this.saveToDisk();
    console.log(`[LocalDeviceDatabase] Updated device ${id}`);
    return updated;
  }
  delete(id) {
    const existed = this.devices.delete(id);
    if (existed) {
      this.saveToDisk();
      console.log(`[LocalDeviceDatabase] Deleted device ${id}`);
    }
    return existed;
  }
};
var deviceDb = new LocalDeviceDatabase();
var CommandQueueManager = class {
  constructor() {
    this.queue = /* @__PURE__ */ new Map();
  }
  enqueue(agentId, command, payload) {
    const cmd = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      command,
      payload,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: "pending"
    };
    const existing = this.queue.get(agentId) || [];
    existing.push(cmd);
    this.queue.set(agentId, existing);
    console.log(`[CommandQueue] Enqueued command "${command}" for agent ${agentId} (ID: ${cmd.id})`);
    return cmd;
  }
  fetchAndDrain(agentId) {
    const list = this.queue.get(agentId) || [];
    if (list.length > 0) {
      this.queue.set(agentId, []);
      console.log(`[CommandQueue] Drained ${list.length} command(s) for agent ${agentId}`);
    }
    return list;
  }
  peek(agentId) {
    return this.queue.get(agentId) || [];
  }
};
var commandQueue = new CommandQueueManager();
var clipboardMonitorInterval = null;
var lastScannedText = "";
var totalBlockedEventsCount = 0;
var mainWindow = null;
function triggerOsAlert(patternName, category) {
  try {
    if (!Notification.isSupported()) return;
    new Notification({
      title: "PromptShield DLP Security Alert",
      body: `Sensitive ${category} (${patternName}) detected on system clipboard. Content blocked automatically.`,
      urgency: "critical",
      silent: false
    }).show();
  } catch (err) {
    console.error("[PromptShield Daemon] Failed to display notification:", err);
  }
}
function checkSensitivePatterns(text) {
  if (!text || typeof text !== "string") return null;
  for (const pattern of SENSITIVE_PATTERNS) {
    try {
      if (pattern.regex.test(text)) {
        return pattern;
      }
    } catch {
    }
  }
  return null;
}
function monitorClipboardTick() {
  try {
    const rawText = typeof clipboard?.readText === "function" ? clipboard.readText() : "";
    const currentText = typeof rawText === "string" ? rawText : "";
    if (!currentText || currentText === lastScannedText || currentText === BLOCKED_CLIPBOARD_TEXT) {
      return;
    }
    lastScannedText = currentText;
    const match = checkSensitivePatterns(currentText);
    if (match) {
      try {
        clipboard.writeText(BLOCKED_CLIPBOARD_TEXT);
      } catch {
      }
      lastScannedText = BLOCKED_CLIPBOARD_TEXT;
      totalBlockedEventsCount++;
      console.warn(`[PromptShield Daemon] BLOCKED sensitive clipboard: ${match.name} [${match.category}]`);
      triggerOsAlert(match.name, match.category);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("clipboard-leak-blocked", {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          ruleId: match.id,
          patternName: match.name,
          category: match.category,
          totalBlockedCount: totalBlockedEventsCount
        });
      }
    }
  } catch (err) {
    console.error("[PromptShield Daemon] Error checking clipboard:", err);
  }
}
function startClipboardDaemon() {
  try {
    if (clipboardMonitorInterval) clearInterval(clipboardMonitorInterval);
    const raw = typeof clipboard?.readText === "function" ? clipboard.readText() : "";
    lastScannedText = typeof raw === "string" ? raw : "";
    clipboardMonitorInterval = setInterval(monitorClipboardTick, CLIPBOARD_CHECK_INTERVAL_MS);
    console.log("[PromptShield Daemon] Background clipboard monitor active.");
  } catch (err) {
    console.error("[PromptShield Daemon] Failed starting clipboard monitor:", err);
  }
}
function stopClipboardDaemon() {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
    console.log("[PromptShield Daemon] Background clipboard monitor stopped.");
  }
}
function createMainWindow() {
  try {
    const preloadPathCjs = path.join(__dirname, "preload.cjs");
    const preloadPathJs = path.join(__dirname, "preload.js");
    const effectivePreload = fs.existsSync(preloadPathCjs) ? preloadPathCjs : fs.existsSync(preloadPathJs) ? preloadPathJs : void 0;
    mainWindow = new BrowserWindow({
      width: 1366,
      height: 880,
      minWidth: 1080,
      minHeight: 720,
      title: "PromptShield v2.5.0 \u2022 100% Local Enterprise EDR",
      backgroundColor: "#0B1017",
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: effectivePreload,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });
    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
      console.log("[PromptShield Main Process] Main window visible.");
    });
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL || "http://localhost:3000";
    if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
      console.log(`[PromptShield Main Process] Connecting to dev server: ${devServerUrl}`);
      mainWindow.loadURL(devServerUrl).catch((err) => {
        console.error(`[PromptShield Main Process] Failed loading URL ${devServerUrl}:`, err);
      });
    } else {
      const prodPath = path.join(__dirname, "../dist/index.html");
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
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    return mainWindow;
  } catch (err) {
    console.error("[PromptShield Main Process] CRITICAL ERROR creating window:", err);
    return null;
  }
}
var localHttpServer = null;
var LOCAL_SERVER_PORT = 8e3;
function startLocalTelemetryServer() {
  if (localHttpServer) return localHttpServer;
  console.log(`[PromptShield Server] Starting local HTTP server on 0.0.0.0:${LOCAL_SERVER_PORT}...`);
  try {
    localHttpServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = req.url || "";
      if (req.method === "GET" && url.startsWith("/agent/install.ps1")) {
        const candidatePaths = [
          path.join(__dirname, "../public/agent/install.ps1"),
          path.join(__dirname, "public/agent/install.ps1"),
          path.join(process.cwd(), "public/agent/install.ps1")
        ];
        let scriptBuffer = null;
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            try {
              scriptBuffer = fs.readFileSync(p);
              break;
            } catch {
            }
          }
        }
        if (scriptBuffer) {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Length": scriptBuffer.length,
            "Content-Disposition": 'inline; filename="install.ps1"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "close",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(scriptBuffer);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("# PromptShield Agent Script Not Found");
        }
        return;
      }
      if (req.method === "GET" && url.startsWith("/agent/install.sh")) {
        const candidatePaths = [
          path.join(__dirname, "../public/agent/install.sh"),
          path.join(__dirname, "public/agent/install.sh"),
          path.join(process.cwd(), "public/agent/install.sh")
        ];
        let scriptBuffer = null;
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            try {
              scriptBuffer = fs.readFileSync(p);
              break;
            } catch {
            }
          }
        }
        if (scriptBuffer) {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Length": scriptBuffer.length,
            "Content-Disposition": 'inline; filename="install.sh"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "close",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(scriptBuffer);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end('#!/bin/bash\necho "Agent script not found"');
        }
        return;
      }
      const commandMatch = url.match(/^\/api\/agent\/([^/]+)\/command$/);
      if (req.method === "POST" && commandMatch) {
        const rawAgentId = decodeURIComponent(commandMatch[1]);
        const matched = deviceDb.findDevice(rawAgentId);
        const agentId = matched ? matched.id : rawAgentId;
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const { command, payload } = parsed;
            if (!command) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Command field is required" }));
              return;
            }
            const queued = commandQueue.enqueue(agentId, command, payload);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "success", commandId: queued.id, queued: true }));
          } catch (pErr) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON payload" }));
          }
        });
        return;
      }
      const uninstallMatch = url.match(/^\/api\/agent\/([^/]+)\/uninstall$/);
      if (req.method === "POST" && uninstallMatch) {
        const rawId = decodeURIComponent(uninstallMatch[1]);
        const matched = deviceDb.findDevice(rawId);
        const targetId = matched ? matched.id : rawId;
        const queued = commandQueue.enqueue(targetId, "UNINSTALL_AGENT", {
          action: "self_delete",
          status: "pending_uninstall",
          manualRemovalPath: "C:\\Windows\\Temp\\PromptShield\\",
          queuedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        if (matched) {
          deviceDb.update(matched.id, {
            status: "Isolated",
            lastSeen: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "success",
          agentId: targetId,
          commandId: queued.id,
          state: "pending_uninstall",
          message: "Agent self-delete command queued. Endpoint will execute on next heartbeat.",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }));
        return;
      }
      const pendingMatch = url.match(/^\/api\/agent\/([^/]+)\/pending-commands$/);
      if (req.method === "GET" && pendingMatch) {
        const rawAgentId = decodeURIComponent(pendingMatch[1]);
        const matched = deviceDb.findDevice(rawAgentId);
        const agentId = matched ? matched.id : rawAgentId;
        const commands = commandQueue.fetchAndDrain(agentId);
        if (matched && matched.status === "Pending") {
          const updated = deviceDb.update(matched.id, {
            status: "Active",
            lastSeen: (/* @__PURE__ */ new Date()).toISOString()
          });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("agent-connected", {
              agentId: matched.id,
              status: "active",
              device: updated
            });
          }
        } else if (matched) {
          deviceDb.update(matched.id, { lastSeen: (/* @__PURE__ */ new Date()).toISOString() });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          agentId,
          count: commands.length,
          commands,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }));
        return;
      }
      if (req.method === "POST" && url === "/api/endpoints/telemetry") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const telemetryData = JSON.parse(body || "{}");
            const agentIdentifier = telemetryData.agentId || telemetryData.endpoint_id || telemetryData.hostname || "";
            console.log(`[PromptShield Server] Telemetry received from: ${agentIdentifier || "Unknown host"}`);
            let matched = deviceDb.findDevice(agentIdentifier);
            if (matched) {
              const updated = deviceDb.update(matched.id, {
                status: "Active",
                ip: telemetryData.ip || (matched.ip === "Awaiting connection..." ? "192.168.1.108" : matched.ip),
                os: telemetryData.os || (matched.os === "OS Unknown" ? "Windows 11 (10.0.22631)" : matched.os),
                lastSeen: (/* @__PURE__ */ new Date()).toISOString(),
                processes: telemetryData.processes || matched.processes
              });
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("agent-connected", {
                  agentId: matched.id,
                  status: "active",
                  device: updated
                });
              }
            } else if (agentIdentifier) {
              const newDev = deviceDb.add({
                id: `dev_${Date.now()}`,
                name: agentIdentifier,
                os: telemetryData.os || "Windows 11 (10.0.22631)",
                ip: telemetryData.ip || "127.0.0.1",
                status: "Active",
                enrolledAt: "Handshake Synchronized",
                lastSeen: (/* @__PURE__ */ new Date()).toISOString(),
                isolated: false,
                clipboardMonitoring: true,
                activeWindowMonitoring: true,
                processes: telemetryData.processes
              });
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("agent-connected", {
                  agentId: newDev.id,
                  status: "active",
                  device: newDev
                });
              }
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("telemetry-received", telemetryData);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "success", message: "Telemetry received and host activated" }));
          } catch (parseErr) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON payload" }));
          }
        });
        return;
      }
      if (req.method === "GET" && (url === "/api/health" || url === "/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "online",
          service: "PromptShield Local Enterprise EDR Server",
          port: LOCAL_SERVER_PORT,
          enrolledDevices: deviceDb.getAll().length,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    });
    localHttpServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`
[PromptShield Server] CRITICAL PORT CONFLICT! Port ${LOCAL_SERVER_PORT} is in use.`);
      } else {
        console.error(`[PromptShield Server] Socket error on port ${LOCAL_SERVER_PORT}:`, err);
      }
    });
    localHttpServer.listen(LOCAL_SERVER_PORT, "0.0.0.0", () => {
      console.log(`
================================================================`);
      console.log(`[PromptShield Server] Local HTTP Telemetry Server ACTIVE & LISTENING`);
      console.log(`  -> URL:              http://0.0.0.0:${LOCAL_SERVER_PORT}`);
      console.log(`  -> Health:           http://127.0.0.1:${LOCAL_SERVER_PORT}/api/health`);
      console.log(`  -> Command Queue:    POST http://0.0.0.0:${LOCAL_SERVER_PORT}/api/agent/:id/command`);
      console.log(`  -> Pending Commands: GET  http://0.0.0.0:${LOCAL_SERVER_PORT}/api/agent/:id/pending-commands`);
      console.log(`================================================================
`);
    });
    return localHttpServer;
  } catch (err) {
    console.error(`[PromptShield Server] FATAL ERROR creating server on port ${LOCAL_SERVER_PORT}:`, err);
    return null;
  }
}
function stopLocalTelemetryServer() {
  if (localHttpServer) {
    try {
      localHttpServer.close();
    } catch {
    }
    localHttpServer = null;
  }
}
console.log("[PromptShield Main Process] Bootstrapping local EDR subsystems...");
startLocalTelemetryServer();
function registerIpcHandlers() {
  ipcMain.handle("get-devices", async () => {
    try {
      return deviceDb.getAll();
    } catch (err) {
      console.error("[IPC] get-devices error:", err);
      return [];
    }
  });
  ipcMain.handle("add-device", async (_event, device) => {
    try {
      return deviceDb.add(device);
    } catch (err) {
      console.error("[IPC] add-device error:", err);
      return device;
    }
  });
  ipcMain.handle("update-device", async (_event, id, updates) => {
    try {
      return deviceDb.update(id, updates);
    } catch (err) {
      console.error("[IPC] update-device error:", err);
      return null;
    }
  });
  ipcMain.handle("delete-device", async (_event, id) => {
    try {
      return deviceDb.delete(id);
    } catch (err) {
      console.error("[IPC] delete-device error:", err);
      return false;
    }
  });
  ipcMain.handle("queue-agent-command", async (_event, agentId, command, payload) => {
    try {
      const queued = commandQueue.enqueue(agentId, command, payload);
      return { status: "success", commandId: queued.id };
    } catch (err) {
      console.error("[IPC] queue-agent-command error:", err);
      return { status: "error", commandId: "" };
    }
  });
  ipcMain.handle("get-pending-commands", async (_event, agentId) => {
    try {
      return commandQueue.peek(agentId);
    } catch (err) {
      console.error("[IPC] get-pending-commands error:", err);
      return [];
    }
  });
  ipcMain.handle("uninstall-agent", async (_event, agentId) => {
    try {
      const matched = deviceDb.findDevice(agentId);
      const targetId = matched ? matched.id : agentId;
      const queued = commandQueue.enqueue(targetId, "UNINSTALL_AGENT", {
        action: "self_delete",
        status: "pending_uninstall",
        manualRemovalPath: "C:\\Windows\\Temp\\PromptShield\\",
        queuedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (matched) {
        deviceDb.update(matched.id, {
          status: "Isolated",
          lastSeen: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      return { status: "success", commandId: queued.id, state: "pending_uninstall" };
    } catch (err) {
      console.error("[IPC] uninstall-agent error:", err);
      return { status: "error", commandId: "", state: "error" };
    }
  });
  ipcMain.handle("get-daemon-status", () => ({
    running: clipboardMonitorInterval !== null,
    intervalMs: CLIPBOARD_CHECK_INTERVAL_MS,
    blockedEventsCount: totalBlockedEventsCount
  }));
  ipcMain.handle("toggle-daemon", (_event, enabled) => {
    if (enabled) {
      startClipboardDaemon();
    } else {
      stopClipboardDaemon();
    }
    return { running: clipboardMonitorInterval !== null };
  });
}
registerIpcHandlers();
app.whenReady().then(() => {
  console.log("[PromptShield Main Process] Electron app.whenReady() resolved. Creating window...");
  createMainWindow();
  startClipboardDaemon();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}).catch((err) => {
  console.error("[PromptShield Main Process] CRITICAL: app.whenReady() rejected:", err);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("will-quit", () => {
  console.log("[PromptShield Main Process] Shutting down application...");
  stopClipboardDaemon();
  stopLocalTelemetryServer();
});
export {
  BLOCKED_CLIPBOARD_TEXT,
  CLIPBOARD_CHECK_INTERVAL_MS,
  LOCAL_SERVER_PORT,
  SENSITIVE_PATTERNS,
  checkSensitivePatterns,
  monitorClipboardTick,
  startClipboardDaemon,
  startLocalTelemetryServer,
  stopClipboardDaemon,
  triggerOsAlert
};
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Enterprise DLP / EDR v2.5.0 - Electron Main Process & Background Daemon
 * 100% Local Enterprise EDR: Persistent Storage, Local Command Queue, and Telemetry Server.
 */
