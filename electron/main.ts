/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Enterprise DLP - Electron Main Process & Background Clipboard Daemon
 */

import { app, BrowserWindow, clipboard, Notification, ipcMain } from 'electron';
import * as path from 'path';

// ============================================================================
// 1. CONFIGURATION & SENSITIVE DATA PATTERNS
// ============================================================================

export const BLOCKED_CLIPBOARD_TEXT = '[SENSITIVE DATA BLOCKED BY PROMPTSHIELD]';
export const CLIPBOARD_CHECK_INTERVAL_MS = 1000;

export interface SensitivePattern {
  id: string;
  name: string;
  category: string;
  regex: RegExp;
  description: string;
}

/**
 * Enterprise Safe Regex Patterns for In-Memory DLP Scanning.
 * Pre-compiled, non-backtracking regular expressions to avoid ReDoS.
 */
export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // 1. Payment Cards: 13 to 19 digits with standard card issuer prefixes
  {
    id: 'rule_credit_card',
    name: 'Payment Card Number',
    category: 'Financial Data (PCI-DSS)',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    description: 'Visa, MasterCard, American Express, or Discover primary account numbers.',
  },
  // 2. OpenAI API Keys (Standard & Project-Scoped)
  {
    id: 'rule_openai_key',
    name: 'OpenAI Secret Key',
    category: 'API Credentials',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
    description: 'OpenAI platform secret key or project token.',
  },
  // 3. Anthropic Claude API Keys
  {
    id: 'rule_anthropic_key',
    name: 'Anthropic Claude API Key',
    category: 'API Credentials',
    regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/,
    description: 'Anthropic Claude API secret key.',
  },
  // 4. GitHub Personal Access Tokens
  {
    id: 'rule_github_pat',
    name: 'GitHub Access Token',
    category: 'Source Control & CI/CD',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/,
    description: 'GitHub personal access token or fine-grained repo token.',
  },
  // 5. AWS Access Key IDs
  {
    id: 'rule_aws_access_key',
    name: 'AWS Access Key ID',
    category: 'Cloud Credentials',
    regex: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
    description: 'Amazon Web Services 20-character IAM access key.',
  },
  // 6. Slack API Tokens
  {
    id: 'rule_slack_token',
    name: 'Slack OAuth Token',
    category: 'API Credentials',
    regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/,
    description: 'Slack bot, app, or user authentication token.',
  },
  // 7. Google Cloud Platform API Keys
  {
    id: 'rule_google_api_key',
    name: 'Google Cloud API Key',
    category: 'Cloud Credentials',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
    description: 'Google Cloud Platform API key identifier.',
  },
  // 8. Cryptographic Private Key Headers
  {
    id: 'rule_private_key',
    name: 'Private Cryptographic Key',
    category: 'PKI & Certificates',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    description: 'Unencrypted PEM private cryptographic key header.',
  },
  // 9. US Social Security Numbers
  {
    id: 'rule_us_ssn',
    name: 'US Social Security Number',
    category: 'PII (Government ID)',
    regex: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/,
    description: 'US Social Security 9-digit hyphenated format.',
  },
  // 10. Database Connection Strings with Passwords
  {
    id: 'rule_database_uri',
    name: 'Database Connection URI',
    category: 'Infrastructure Credentials',
    regex: /\b(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s:]+:[^\s@]+@[^\s\/]+/i,
    description: 'Direct database connection URI containing embedded username and password.',
  },
];

// ============================================================================
// 2. BACKGROUND CLIPBOARD DAEMON STATE & LOGIC
// ============================================================================

let clipboardMonitorInterval: NodeJS.Timeout | null = null;
let lastScannedText = '';
let totalBlockedEventsCount = 0;
let mainWindow: BrowserWindow | null = null;

/**
 * Triggers an OS-Level Desktop Notification via Electron's Notification API.
 */
export function triggerOsAlert(patternName: string, category: string): void {
  try {
    if (!Notification.isSupported()) {
      console.warn('[PromptShield Daemon] OS Notifications are not supported on this platform.');
      return;
    }

    const notification = new Notification({
      title: 'PromptShield DLP Security Alert',
      body: `Sensitive ${category} (${patternName}) detected on system clipboard. Content was automatically blocked and overwritten.`,
      urgency: 'critical',
      silent: false,
    });

    notification.show();
  } catch (err) {
    console.error('[PromptShield Daemon] Failed to display OS notification:', err);
  }
}

/**
 * Evaluates text against the safe regex patterns.
 * Returns the first matched sensitive pattern, or null if text is clean.
 */
export function checkSensitivePatterns(text: string): SensitivePattern | null {
  if (!text || text.length === 0) return null;
  
  // Fast length pre-filter: skip strings shorter than minimum token length
  if (text.length < 10) return null;

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.regex.test(text)) {
      return pattern;
    }
  }

  return null;
}

/**
 * Main continuous daemon tick function.
 * Executed every 1000ms by setInterval.
 */
export function monitorClipboardTick(): void {
  try {
    const currentText = clipboard.readText();

    // Skip if empty, identical to last scanned text, or already sanitized
    if (!currentText || currentText === lastScannedText || currentText === BLOCKED_CLIPBOARD_TEXT) {
      return;
    }

    lastScannedText = currentText;

    // Evaluate for sensitive patterns
    const match = checkSensitivePatterns(currentText);

    if (match) {
      // 1. Instantly overwrite the system clipboard
      clipboard.writeText(BLOCKED_CLIPBOARD_TEXT);
      lastScannedText = BLOCKED_CLIPBOARD_TEXT;
      totalBlockedEventsCount++;

      console.warn(
        `[PromptShield Daemon] BLOCKED sensitive clipboard content: ${match.name} [${match.category}]`
      );

      // 2. Trigger native OS-level desktop notification
      triggerOsAlert(match.name, match.category);

      // 3. Notify renderer process via IPC if main window is available
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

/**
 * Starts the continuous background clipboard monitor.
 */
export function startClipboardDaemon(): void {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
  }

  // Seed lastScannedText with current clipboard content to avoid false trigger on start
  try {
    lastScannedText = clipboard.readText() || '';
  } catch {
    lastScannedText = '';
  }

  clipboardMonitorInterval = setInterval(monitorClipboardTick, CLIPBOARD_CHECK_INTERVAL_MS);
  console.log('[PromptShield Daemon] Background clipboard monitor daemon started (polling every 1000ms).');
}

/**
 * Stops the continuous background clipboard monitor.
 */
export function stopClipboardDaemon(): void {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
    console.log('[PromptShield Daemon] Background clipboard monitor daemon stopped.');
  }
}

// ============================================================================
// 3. ELECTRON BROWSER WINDOW INITIALIZATION & SECURITY
// ============================================================================

function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    title: 'PromptShield v2.4.0 • Local DLP',
    backgroundColor: '#0B1017',
    show: false,
    webPreferences: {
      nodeIntegration: false, // Security: Prevent renderer from executing native Node
      contextIsolation: true,  // Security: Protect against prototype pollution
      sandbox: true,           // Security: Run renderer inside Chromium sandbox
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load UI from dev server or production index.html
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ============================================================================
// 4. APP LIFECYCLE & IPC REGISTRATION
// ============================================================================

app.whenReady().then(() => {
  createMainWindow();
  startClipboardDaemon();

  // IPC Handlers for UI queries
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopClipboardDaemon();
});
