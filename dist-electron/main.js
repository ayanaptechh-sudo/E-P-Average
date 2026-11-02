import { BrowserWindow, Notification, app, clipboard, ipcMain } from "electron";
import * as path from "path";
import * as http from "http";
import * as fs from "fs";
import { fileURLToPath } from "url";
// electron/main.ts
/**
* @license
* SPDX-License-Identifier: Apache-2.0
* 
* PromptShield Enterprise DLP - Electron Main Process & Background Clipboard Daemon
*/
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
process.on("uncaughtException", (error) => {
	console.error("\n================ [PromptShield] UNCAUGHT EXCEPTION ================");
	console.error("Message:", error?.message || error);
	if (error?.stack) console.error("Stack:\n", error.stack);
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
/**
* Enterprise Safe Regex Patterns for In-Memory DLP Scanning.
* Pre-compiled, non-backtracking regular expressions to avoid ReDoS.
*/
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
var clipboardMonitorInterval = null;
var lastScannedText = "";
var totalBlockedEventsCount = 0;
var mainWindow = null;
/**
* Triggers an OS-Level Desktop Notification via Electron's Notification API.
*/
function triggerOsAlert(patternName, category) {
	try {
		if (!Notification.isSupported()) {
			console.warn("[PromptShield Daemon] OS Notifications are not supported on this platform.");
			return;
		}
		new Notification({
			title: "PromptShield DLP Security Alert",
			body: `Sensitive ${category} (${patternName}) detected on system clipboard. Content was automatically blocked and overwritten.`,
			urgency: "critical",
			silent: false
		}).show();
	} catch (err) {
		console.error("[PromptShield Daemon] Failed to display OS notification:", err);
	}
}
/**
* Evaluates text against the safe regex patterns.
* Returns the first matched sensitive pattern, or null if text is clean.
*/
function checkSensitivePatterns(text) {
	if (!text || typeof text !== "string") return null;
	for (const pattern of SENSITIVE_PATTERNS) try {
		if (pattern.regex.test(text)) return pattern;
	} catch (err) {
		console.error(`[PromptShield Daemon] Error evaluating regex rule "${pattern.id}":`, err);
	}
	return null;
}
/**
* Main continuous daemon tick function.
* Executed every 1000ms by setInterval.
*/
function monitorClipboardTick() {
	try {
		const rawText = typeof clipboard?.readText === "function" ? clipboard.readText() : "";
		const currentText = typeof rawText === "string" ? rawText : "";
		if (!currentText || currentText === lastScannedText || currentText === "[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]") return;
		lastScannedText = currentText;
		const match = checkSensitivePatterns(currentText);
		if (match) {
			try {
				clipboard.writeText(BLOCKED_CLIPBOARD_TEXT);
			} catch (clipErr) {
				console.error("[PromptShield Daemon] Failed to write blocked text to clipboard:", clipErr);
			}
			lastScannedText = BLOCKED_CLIPBOARD_TEXT;
			totalBlockedEventsCount++;
			console.warn(`[PromptShield Daemon] BLOCKED sensitive clipboard content: ${match.name} [${match.category}]`);
			triggerOsAlert(match.name, match.category);
			if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("clipboard-leak-blocked", {
				timestamp: (/* @__PURE__ */ new Date()).toISOString(),
				ruleId: match.id,
				patternName: match.name,
				category: match.category,
				totalBlockedCount: totalBlockedEventsCount
			});
		}
	} catch (err) {
		console.error("[PromptShield Daemon] Error checking clipboard:", err);
	}
}
/**
* Starts the continuous background clipboard monitor.
*/
function startClipboardDaemon() {
	try {
		if (clipboardMonitorInterval) clearInterval(clipboardMonitorInterval);
		try {
			const raw = typeof clipboard?.readText === "function" ? clipboard.readText() : "";
			lastScannedText = typeof raw === "string" ? raw : "";
		} catch {
			lastScannedText = "";
		}
		clipboardMonitorInterval = setInterval(monitorClipboardTick, CLIPBOARD_CHECK_INTERVAL_MS);
		console.log("[PromptShield Daemon] Background clipboard monitor daemon started (polling every 1000ms).");
	} catch (err) {
		console.error("[PromptShield Daemon] Failed to initialize clipboard monitor daemon:", err);
	}
}
/**
* Stops the continuous background clipboard monitor.
*/
function stopClipboardDaemon() {
	if (clipboardMonitorInterval) {
		clearInterval(clipboardMonitorInterval);
		clipboardMonitorInterval = null;
		console.log("[PromptShield Daemon] Background clipboard monitor daemon stopped.");
	}
}
function createMainWindow() {
	try {
		mainWindow = new BrowserWindow({
			width: 1366,
			height: 880,
			minWidth: 1080,
			minHeight: 720,
			title: "PromptShield v2.4.0 • Local DLP",
			backgroundColor: "#0B1017",
			show: false,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webSecurity: true,
				allowRunningInsecureContent: false
			}
		});
		mainWindow.once("ready-to-show", () => {
			mainWindow?.show();
			console.log("[PromptShield Main Process] Main window shown.");
		});
		const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL || "http://localhost:3000";
		if (process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL) {
			console.log(`[PromptShield Main Process] Connecting window to dev server: ${devServerUrl}`);
			mainWindow.loadURL(devServerUrl).catch((err) => {
				console.error(`[PromptShield Main Process] Failed to load URL ${devServerUrl}:`, err);
			});
		} else {
			const prodPath = path.join(__dirname, "../dist/index.html");
			console.log(`[PromptShield Main Process] Loading production bundle: ${prodPath}`);
			if (fs.existsSync(prodPath)) mainWindow.loadFile(prodPath).catch((err) => {
				console.error(`[PromptShield Main Process] Failed to load production file ${prodPath}:`, err);
			});
			else {
				console.warn(`[PromptShield Main Process] dist/index.html not found, falling back to ${devServerUrl}`);
				mainWindow.loadURL(devServerUrl).catch((err) => {
					console.error(`[PromptShield Main Process] Fallback URL failed to load:`, err);
				});
			}
		}
		mainWindow.on("closed", () => {
			mainWindow = null;
		});
		return mainWindow;
	} catch (err) {
		console.error("[PromptShield Main Process] CRITICAL ERROR creating main window:", err);
		return null;
	}
}
var localHttpServer = null;
var LOCAL_SERVER_PORT = 8e3;
function startLocalTelemetryServer() {
	if (localHttpServer) {
		console.log(`[PromptShield Server] Port ${LOCAL_SERVER_PORT} server already instantiated.`);
		return localHttpServer;
	}
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
				const psPath = path.join(__dirname, "../public/agent/install.ps1");
				if (fs.existsSync(psPath)) {
					res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
					fs.createReadStream(psPath).pipe(res);
				} else {
					res.writeHead(404, { "Content-Type": "text/plain" });
					res.end("Agent script not found");
				}
				return;
			}
			if (req.method === "GET" && url.startsWith("/agent/install.sh")) {
				const shPath = path.join(__dirname, "../public/agent/install.sh");
				if (fs.existsSync(shPath)) {
					res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
					fs.createReadStream(shPath).pipe(res);
				} else {
					res.writeHead(404, { "Content-Type": "text/plain" });
					res.end("Agent script not found");
				}
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
						console.log(`[PromptShield Server] Received telemetry event from: ${telemetryData.hostname || "Unknown host"}`);
						if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("telemetry-received", telemetryData);
						if (telemetryData.event_type === "CLIPBOARD_DLP_BLOCKED" || telemetryData.event_type === "AI_PROMPT_INTERCEPTED") try {
							if (Notification.isSupported()) new Notification({
								title: "PromptShield Alert • " + (telemetryData.hostname || "Endpoint Host"),
								body: `Blocked ${telemetryData.violation_category || "sensitive data"} transfer to AI tool.`,
								urgency: "critical"
							}).show();
						} catch (nErr) {
							console.error("[PromptShield Server] Notification display error:", nErr);
						}
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({
							status: "success",
							message: "Telemetry received"
						}));
					} catch (parseErr) {
						console.error("[PromptShield Server] Failed to parse telemetry payload:", parseErr);
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
					service: "PromptShield Local EDR Server",
					port: LOCAL_SERVER_PORT,
					timestamp: (/* @__PURE__ */ new Date()).toISOString()
				}));
				return;
			}
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Endpoint not found" }));
		});
		localHttpServer.on("error", (err) => {
			if (err.code === "EADDRINUSE") {
				console.error(`\n================================================================`);
				console.error(`[PromptShield Server] CRITICAL PORT CONFLICT!`);
				console.error(`Port ${LOCAL_SERVER_PORT} is ALREADY IN USE by another process.`);
				console.error(`Run in terminal: netstat -ano | findstr :${LOCAL_SERVER_PORT} (Windows) or lsof -i :${LOCAL_SERVER_PORT} (Linux/Mac)`);
				console.error(`================================================================\n`);
			} else console.error(`[PromptShield Server] Socket error on port ${LOCAL_SERVER_PORT}:`, err);
		});
		localHttpServer.listen(LOCAL_SERVER_PORT, "0.0.0.0", () => {
			console.log(`\n================================================================`);
			console.log(`[PromptShield Server] Local HTTP Telemetry Server ACTIVE & LISTENING`);
			console.log(`  -> URL:         http://0.0.0.0:${LOCAL_SERVER_PORT}`);
			console.log(`  -> Health:      http://127.0.0.1:${LOCAL_SERVER_PORT}/api/health`);
			console.log(`  -> Telemetry:   POST http://0.0.0.0:${LOCAL_SERVER_PORT}/api/endpoints/telemetry`);
			console.log(`  -> Port ${LOCAL_SERVER_PORT} ready for LAN host enrollment`);
			console.log(`================================================================\n`);
		});
		return localHttpServer;
	} catch (err) {
		console.error(`[PromptShield Server] FATAL ERROR creating HTTP server on port ${LOCAL_SERVER_PORT}:`, err);
		return null;
	}
}
function stopLocalTelemetryServer() {
	if (localHttpServer) {
		try {
			localHttpServer.close();
			console.log("[PromptShield Server] Local telemetry server closed.");
		} catch (err) {
			console.error("[PromptShield Server] Error closing telemetry server:", err);
		}
		localHttpServer = null;
	}
}
console.log("[PromptShield Main Process] Bootstrapping PromptShield subsystems...");
startLocalTelemetryServer();
app.whenReady().then(() => {
	console.log("[PromptShield Main Process] Electron app.whenReady() completed successfully.");
	createMainWindow();
	startClipboardDaemon();
	ipcMain.handle("get-daemon-status", () => ({
		running: clipboardMonitorInterval !== null,
		intervalMs: CLIPBOARD_CHECK_INTERVAL_MS,
		blockedEventsCount: totalBlockedEventsCount
	}));
	ipcMain.handle("toggle-daemon", (_event, enabled) => {
		if (enabled) startClipboardDaemon();
		else stopClipboardDaemon();
		return { running: clipboardMonitorInterval !== null };
	});
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
}).catch((err) => {
	console.error("\n================================================================");
	console.error("[PromptShield Main Process] CRITICAL: app.whenReady() rejected:");
	console.error(err);
	console.error("================================================================\n");
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
	console.log("[PromptShield Main Process] Application quitting, tearing down daemons...");
	stopClipboardDaemon();
	stopLocalTelemetryServer();
});
export { BLOCKED_CLIPBOARD_TEXT, CLIPBOARD_CHECK_INTERVAL_MS, LOCAL_SERVER_PORT, SENSITIVE_PATTERNS, checkSensitivePatterns, monitorClipboardTick, startClipboardDaemon, startLocalTelemetryServer, stopClipboardDaemon, triggerOsAlert };
