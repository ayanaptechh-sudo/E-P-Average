/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import initSqlJsInline from 'sql.js/dist/sql-wasm-inline.js';
// @ts-ignore
import initSqlJsAsm from 'sql.js/dist/sql-asm.js';
import initSqlJsStandard, { Database, SqlJsStatic } from 'sql.js';

const DB_STORE_NAME = 'promptshield_db_store';
const DB_KEY = 'sqlite_db_binary';
const DB_VERSION = 1;

let SQL: SqlJsStatic | null = null;
let dbInstance: Database | null = null;
let isInitialized = false;

// IndexedDB Helper for persisting SQLite binary array with full try/catch resilience
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_STORE_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains('files')) {
            db.createObjectStore('files');
          }
        } catch (upgradeErr) {
          console.warn('IndexedDB onupgradeneeded error:', upgradeErr);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
    } catch (e) {
      reject(e);
    }
  });
}

async function loadFromIndexedDB(): Promise<Uint8Array | null> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction('files', 'readonly');
        const store = tx.objectStore('files');
        const req = store.get(DB_KEY);
        req.onsuccess = () => {
          try {
            if (req.result instanceof Uint8Array) {
              resolve(req.result);
            } else if (req.result instanceof ArrayBuffer) {
              resolve(new Uint8Array(req.result));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        };
        req.onerror = () => {
          console.warn('IndexedDB read request error');
          resolve(null);
        };
      } catch (txErr) {
        console.warn('IndexedDB read transaction error, continuing with fresh memory:', txErr);
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('Could not read from IndexedDB, starting fresh in memory:', err);
    return null;
  }
}

async function saveToIndexedDB(data: Uint8Array): Promise<void> {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve) => {
      try {
        const tx = idb.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const req = store.put(data, DB_KEY);
        req.onsuccess = () => resolve();
        req.onerror = (e) => {
          console.warn('IndexedDB put error:', e);
          resolve();
        };
      } catch (txErr) {
        console.warn('IndexedDB transaction error:', txErr);
        resolve();
      }
    });
  } catch (err) {
    console.warn('Failed to persist SQLite to IndexedDB:', err);
  }
}

/**
 * Initialize SQLite database with foreign keys, schema, and indexes.
 * Primary: Bundled inline WASM (zero network fetch, embedded base64 wasm).
 * Secondary: Pure JavaScript ASM.js (100% offline, requires no WebAssembly streaming).
 * Tertiary: Local static /sql-wasm.wasm using pre-buffered ArrayBuffer.
 */
export async function initDatabase(): Promise<{ isFirstRun: boolean }> {
  if (isInitialized && dbInstance) {
    try {
      const countRes = query<{ count: number }>('SELECT count(*) as count FROM app_users');
      return { isFirstRun: !countRes[0] || countRes[0].count === 0 };
    } catch {
      isInitialized = false;
    }
  }

  // 1. Primary: Bundled inline WASM (zero network fetch, embedded base64)
  try {
    const inlineFn = typeof initSqlJsInline === 'function' ? initSqlJsInline : (initSqlJsInline as any)?.default;
    if (typeof inlineFn === 'function') {
      SQL = await inlineFn();
      console.log('[PromptShield] Initialized local SQLite via inline WASM engine.');
    }
  } catch (inlineErr) {
    console.warn('[PromptShield] Inline WASM failed, attempting ASM.js:', inlineErr);
  }

  // 2. Secondary: Pure JavaScript ASM.js (100% offline, requires NO WebAssembly support)
  if (!SQL) {
    try {
      const asmFn = typeof initSqlJsAsm === 'function' ? initSqlJsAsm : (initSqlJsAsm as any)?.default;
      if (typeof asmFn === 'function') {
        SQL = await asmFn();
        console.log('[PromptShield] Initialized local SQLite via ASM.js engine.');
      }
    } catch (asmErr) {
      console.warn('[PromptShield] ASM.js engine fallback failed:', asmErr);
    }
  }

  // 3. Tertiary: Local static /sql-wasm.wasm using ArrayBuffer fetch
  if (!SQL) {
    try {
      const wasmResp = await fetch('/sql-wasm.wasm');
      if (wasmResp.ok) {
        const wasmBinary = await wasmResp.arrayBuffer();
        SQL = await initSqlJsStandard({ wasmBinary });
        console.log('[PromptShield] Initialized local SQLite via ArrayBuffer wasmBinary.');
      }
    } catch (binErr) {
      console.warn('[PromptShield] ArrayBuffer wasm load failed:', binErr);
    }
  }

  // 4. Quaternary: Standard locateFile
  if (!SQL) {
    try {
      SQL = await initSqlJsStandard({
        locateFile: () => `/sql-wasm.wasm`,
      });
    } catch (stdErr) {
      console.warn('[PromptShield] Standard locateFile failed:', stdErr);
    }
  }

  if (!SQL) {
    throw new Error('Failed to load sql.js engine from inline WASM, ASM.js, and local sources.');
  }

  // 2. Load from IndexedDB with corrupt-snapshot fallback
  let loadedFromSnapshot = false;
  try {
    const savedData = await loadFromIndexedDB();
    if (savedData && savedData.length > 0) {
      try {
        dbInstance = new SQL.Database(savedData);
        // Verify database integrity by executing a basic PRAGMA
        dbInstance.exec('PRAGMA user_version;');
        loadedFromSnapshot = true;
      } catch (snapshotErr) {
        console.warn('Corrupt SQLite snapshot detected in IndexedDB, discarding and starting clean:', snapshotErr);
        if (dbInstance) {
          try { dbInstance.close(); } catch {}
          dbInstance = null;
        }
      }
    }
  } catch (idbErr) {
    console.warn('Error reading IndexedDB snapshot, starting fresh:', idbErr);
  }

  if (!loadedFromSnapshot || !dbInstance) {
    dbInstance = new SQL.Database();
  }

  // Enable foreign keys
  dbInstance.run('PRAGMA foreign_keys = ON;');

  // Run schema definitions
  createSchema(dbInstance);

  await persistDb();
  isInitialized = true;

  // Determine if first run
  const countRes = query<{ count: number }>('SELECT count(*) as count FROM app_users');
  const isFirstRun = !countRes[0] || countRes[0].count === 0;

  return { isFirstRun };
}

function createSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS app_users (
      user_id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_tools (
      tool_id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      tool_type TEXT NOT NULL,
      identifier TEXT NOT NULL,
      category TEXT NOT NULL,
      approval_status TEXT NOT NULL DEFAULT 'Unreviewed',
      risk_policy TEXT NOT NULL DEFAULT 'Standard',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      usage_event_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      device_identifier TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_time TEXT NOT NULL,
      detection_source TEXT NOT NULL,
      confidence REAL NOT NULL,
      collection_status TEXT NOT NULL,
      approval_status_at_detection TEXT NOT NULL,
      FOREIGN KEY (tool_id) REFERENCES ai_tools(tool_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scan_sessions (
      scan_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tool_id TEXT,
      scan_time TEXT NOT NULL,
      scan_source TEXT NOT NULL,
      detected_count INTEGER NOT NULL DEFAULT 0,
      categories_json TEXT NOT NULL DEFAULT '[]',
      highest_risk TEXT NOT NULL DEFAULT 'None',
      scan_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS findings (
      finding_id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      usage_event_id TEXT,
      user_id TEXT NOT NULL,
      tool_id TEXT,
      category TEXT NOT NULL,
      match_count INTEGER NOT NULL DEFAULT 0,
      rule_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      explanation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New',
      action_taken TEXT NOT NULL DEFAULT 'Warned',
      policy_version INTEGER NOT NULL DEFAULT 1,
      false_positive_note TEXT DEFAULT '',
      FOREIGN KEY (scan_id) REFERENCES scan_sessions(scan_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS redaction_events (
      redaction_event_id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      redaction_count INTEGER NOT NULL DEFAULT 0,
      categories_json TEXT NOT NULL DEFAULT '[]',
      action_time TEXT NOT NULL,
      action_status TEXT NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES scan_sessions(scan_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS risk_scores (
      risk_score_id TEXT PRIMARY KEY,
      user_id TEXT,
      department TEXT,
      score REAL NOT NULL,
      risk_level TEXT NOT NULL,
      scoring_window TEXT NOT NULL,
      explanation TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      alert_id TEXT PRIMARY KEY,
      finding_id TEXT,
      user_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      assigned_to TEXT,
      status TEXT NOT NULL DEFAULT 'Open',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (finding_id) REFERENCES findings(finding_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      incident_id TEXT PRIMARY KEY,
      incident_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      user_id TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      assigned_to TEXT,
      summary TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS incident_timeline (
      timeline_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      source_record_id TEXT,
      event_time TEXT NOT NULL,
      description TEXT NOT NULL,
      recorded_by TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(incident_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS policies (
      policy_id TEXT NOT NULL,
      policy_name TEXT NOT NULL,
      policy_type TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      version INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (policy_id, version)
    );

    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      incident_id TEXT,
      report_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      sha256_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      audit_log_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      outcome TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Performance Indexes
    CREATE INDEX IF NOT EXISTS idx_usage_events_time ON usage_events(event_time);
    CREATE INDEX IF NOT EXISTS idx_usage_events_tool ON usage_events(tool_id);
    CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_scan_sessions_time ON scan_sessions(scan_time);
    CREATE INDEX IF NOT EXISTS idx_findings_time ON findings(created_at);
    CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_incidents_number ON incidents(incident_number);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
  `);
}

let txDepth = 0;

/**
 * Persist SQLite binary to IndexedDB
 */
export async function persistDb(): Promise<void> {
  if (!dbInstance) return;
  if (txDepth > 0) return; // return early while in transaction
  try {
    const binary = dbInstance.export();
    try {
      dbInstance.run('PRAGMA foreign_keys = ON;');
    } catch {}
    await saveToIndexedDB(binary);
  } catch (err) {
    console.warn('persistDb export warning:', err);
  }
}

/**
 * Parameterized SELECT query returning typed array of rows
 */
export function query<T>(sql: string, params: (string | number | null | boolean | Uint8Array)[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  try {
    stmt.bind(params as (string | number | null)[]);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as unknown as T);
    }
    return results;
  } finally {
    stmt.free();
  }
}

/**
 * Execute parameterized INSERT/UPDATE/DELETE statement and persist to IndexedDB
 */
export async function execute(
  sql: string,
  params: (string | number | null | boolean | Uint8Array)[] = []
): Promise<void> {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params as (string | number | null)[]);
  await persistDb();
}

/**
 * Execute multiple writes within a transaction and persist once at the end
 */
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  if (!dbInstance) throw new Error('Database not initialized');
  txDepth++;
  if (txDepth === 1) {
    dbInstance.run('BEGIN TRANSACTION;');
  }
  try {
    const result = await fn();
    txDepth--;
    if (txDepth === 0) {
      dbInstance.run('COMMIT;');
      await persistDb();
    }
    return result;
  } catch (err) {
    txDepth--;
    if (txDepth === 0) {
      try {
        dbInstance.run('ROLLBACK;');
      } catch (rollbackErr) {
        console.warn('Transaction rollback failed (preserved original error):', rollbackErr);
      }
    }
    throw err;
  }
}

/**
 * Export raw SQLite database file as Uint8Array
 */
export function exportDatabase(): Uint8Array {
  if (!dbInstance) throw new Error('Database not initialized');
  const binary = dbInstance.export();
  try {
    dbInstance.run('PRAGMA foreign_keys = ON;');
  } catch {}
  return binary;
}

/**
 * Import and replace SQLite database from binary Uint8Array
 */
export async function importDatabase(data: Uint8Array): Promise<void> {
  if (!SQL) throw new Error('SQL.js not initialized');
  if (dbInstance) {
    try { dbInstance.close(); } catch {}
  }
  dbInstance = new SQL.Database(data);
  dbInstance.run('PRAGMA foreign_keys = ON;');
  createSchema(dbInstance);
  await persistDb();
}

/**
 * Completely wipe database and re-initialize
 */
export async function resetDatabase(): Promise<void> {
  if (!SQL) throw new Error('SQL.js not initialized');
  if (dbInstance) {
    try { dbInstance.close(); } catch {}
  }
  dbInstance = new SQL.Database();
  dbInstance.run('PRAGMA foreign_keys = ON;');
  createSchema(dbInstance);
  await persistDb();
}
