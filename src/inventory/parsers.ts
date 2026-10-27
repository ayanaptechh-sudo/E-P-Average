/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AiTool, CollectionStatus, DetectionSource, UsageEvent, ToolApprovalStatus } from '../database/types';

export interface ParsedImportResult {
  source: DetectionSource;
  status: CollectionStatus;
  totalParsed: number;
  matchedCount: number;
  unmatchedCount: number;
  events: Omit<UsageEvent, 'usage_event_id'>[];
  errors: string[];
}

/**
 * Extract clean hostname / domain from URL without path or parameters.
 * Privacy invariant: full URL paths and query parameters are NEVER preserved.
 */
export function extractCleanDomain(input: string): string {
  try {
    let clean = input.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const url = new URL(clean);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return input.trim().toLowerCase().split('/')[0].replace(/^www\./, '');
  }
}

/**
 * Parse browser history CSV or JSON
 * Accepts formats:
 * - JSON array of objects with { url | domain, visitTime | lastVisitTime | time | date }
 * - CSV with columns like url,title,visit_time OR url,timestamp
 */
export function parseBrowserHistoryImport(
  rawContent: string,
  catalog: AiTool[],
  userId: string,
  deviceIdentifier = 'workstation-local'
): ParsedImportResult {
  const errors: string[] = [];
  const events: Omit<UsageEvent, 'usage_event_id'>[] = [];
  let totalParsed = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  try {
    const trimmed = rawContent.trim();
    if (!trimmed) {
      return {
        source: 'Browser History Import',
        status: 'Error',
        totalParsed: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        events: [],
        errors: ['Import file is empty.'],
      };
    }

    let records: { domain: string; time: string }[] = [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      // JSON format
      try {
        const parsed = JSON.parse(trimmed);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          totalParsed++;
          const urlOrDomain = item.url || item.domain || item.host || item.pageUrl || '';
          if (!urlOrDomain) continue;

          const domain = extractCleanDomain(urlOrDomain);
          // Parse time
          let eventTime = new Date().toISOString();
          const rawTime = item.visitTime || item.lastVisitTime || item.time || item.date || item.timestamp;
          if (rawTime) {
            const d = new Date(typeof rawTime === 'number' && rawTime > 1e11 ? rawTime : rawTime);
            if (!isNaN(d.getTime())) {
              eventTime = d.toISOString();
            }
          }

          records.push({ domain, time: eventTime });
        }
      } catch (jsonErr) {
        errors.push(`JSON parse error: ${String(jsonErr)}`);
      }
    } else {
      // CSV format
      const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        // Check header
        const header = lines[0].toLowerCase().split(',');
        const urlIdx = header.findIndex(h => h.includes('url') || h.includes('domain') || h.includes('host'));
        const timeIdx = header.findIndex(h => h.includes('time') || h.includes('date'));

        const startLine = urlIdx !== -1 ? 1 : 0;
        const actualUrlIdx = urlIdx !== -1 ? urlIdx : 0;
        const actualTimeIdx = timeIdx !== -1 ? timeIdx : 1;

        for (let i = startLine; i < lines.length; i++) {
          totalParsed++;
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          const urlOrDomain = cols[actualUrlIdx];
          if (!urlOrDomain) continue;

          const domain = extractCleanDomain(urlOrDomain);
          let eventTime = new Date().toISOString();
          if (cols[actualTimeIdx]) {
            const d = new Date(cols[actualTimeIdx]);
            if (!isNaN(d.getTime())) {
              eventTime = d.toISOString();
            }
          }
          records.push({ domain, time: eventTime });
        }
      }
    }

    // Match extracted domains against AI catalog
    for (const rec of records) {
      const match = catalog.find(tool => {
        const toolIdent = tool.identifier.toLowerCase();
        return rec.domain === toolIdent || rec.domain.endsWith('.' + toolIdent);
      });

      if (match) {
        matchedCount++;
        const confidence = rec.domain === match.identifier.toLowerCase() ? 1.0 : 0.85;
        events.push({
          user_id: userId,
          tool_id: match.tool_id,
          device_identifier: deviceIdentifier,
          event_type: 'Visit',
          event_time: rec.time,
          detection_source: 'Browser History Import',
          confidence,
          collection_status: 'Success',
          approval_status_at_detection: match.approval_status,
        });
      } else {
        unmatchedCount++;
      }
    }

    const status: CollectionStatus =
      errors.length > 0 && events.length === 0
        ? 'Error'
        : errors.length > 0 || unmatchedCount > matchedCount
        ? 'Partial'
        : 'Success';

    return {
      source: 'Browser History Import',
      status,
      totalParsed,
      matchedCount,
      unmatchedCount,
      events,
      errors,
    };
  } catch (err) {
    return {
      source: 'Browser History Import',
      status: 'Error',
      totalParsed,
      matchedCount: 0,
      unmatchedCount: 0,
      events: [],
      errors: [err instanceof Error ? err.message : 'Unknown parsing error'],
    };
  }
}

/**
 * Parse Process Inventory (tasklist CSV/JSON or text dump)
 */
export function parseProcessInventoryImport(
  rawContent: string,
  catalog: AiTool[],
  userId: string,
  deviceIdentifier = 'workstation-local'
): ParsedImportResult {
  const errors: string[] = [];
  const events: Omit<UsageEvent, 'usage_event_id'>[] = [];
  let totalParsed = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  const now = new Date().toISOString();

  try {
    const trimmed = rawContent.trim();
    if (!trimmed) {
      return {
        source: 'Process Inventory Import',
        status: 'Error',
        totalParsed: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        events: [],
        errors: ['Import content is empty.'],
      };
    }

    const processNames: string[] = [];

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          totalParsed++;
          const name = item.name || item.processName || item.ImageName || item.command || '';
          if (name) processNames.push(String(name).toLowerCase());
        }
      } catch (e) {
        errors.push(`JSON process parse error: ${String(e)}`);
      }
    } else {
      // Lines of text or CSV
      const lines = trimmed.split(/\r?\n/).filter(l => l.trim().length > 0);
      for (const line of lines) {
        totalParsed++;
        // tasklist /fo csv has "Image Name","PID",...
        const parts = line.split(/,|\s+/).map(p => p.trim().replace(/^"|"$/g, ''));
        const candidate = parts[0] ? parts[0].toLowerCase() : '';
        if (candidate && !candidate.startsWith('image') && !candidate.startsWith('===')) {
          processNames.push(candidate);
        }
      }
    }

    // Match against Desktop App catalog tools
    for (const proc of processNames) {
      const match = catalog.find(tool => {
        if (tool.tool_type !== 'Desktop App') return false;
        const ident = tool.identifier.toLowerCase();
        return proc === ident || proc.includes(ident.replace('.exe', ''));
      });

      if (match) {
        matchedCount++;
        events.push({
          user_id: userId,
          tool_id: match.tool_id,
          device_identifier: deviceIdentifier,
          event_type: 'App Detected',
          event_time: now,
          detection_source: 'Process Inventory Import',
          confidence: 0.95,
          collection_status: 'Success',
          approval_status_at_detection: match.approval_status,
        });
      } else {
        unmatchedCount++;
      }
    }

    const status: CollectionStatus =
      errors.length > 0 && events.length === 0 ? 'Error' : errors.length > 0 ? 'Partial' : 'Success';

    return {
      source: 'Process Inventory Import',
      status,
      totalParsed,
      matchedCount,
      unmatchedCount,
      events,
      errors,
    };
  } catch (err) {
    return {
      source: 'Process Inventory Import',
      status: 'Error',
      totalParsed,
      matchedCount: 0,
      unmatchedCount: 0,
      events: [],
      errors: [err instanceof Error ? err.message : 'Unknown process parse error'],
    };
  }
}

/**
 * Parse Extension Inventory JSON (name, id, version, permissions)
 */
export function parseExtensionInventoryImport(
  rawContent: string,
  catalog: AiTool[],
  userId: string,
  deviceIdentifier = 'browser-local'
): ParsedImportResult {
  const errors: string[] = [];
  const events: Omit<UsageEvent, 'usage_event_id'>[] = [];
  let totalParsed = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;
  const now = new Date().toISOString();

  try {
    const trimmed = rawContent.trim();
    if (!trimmed) {
      return {
        source: 'Extension Inventory Import',
        status: 'Error',
        totalParsed: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        events: [],
        errors: ['Extension list is empty.'],
      };
    }

    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    for (const ext of list) {
      totalParsed++;
      const extId = (ext.id || ext.extensionId || '').toLowerCase().trim();
      const extName = (ext.name || '').toLowerCase().trim();

      const match = catalog.find(tool => {
        if (tool.tool_type !== 'Extension') return false;
        const toolIdent = tool.identifier.toLowerCase();
        return (
          (extId && extId === toolIdent) ||
          (extName && tool.tool_name.toLowerCase().includes(extName))
        );
      });

      if (match) {
        matchedCount++;
        events.push({
          user_id: userId,
          tool_id: match.tool_id,
          device_identifier: deviceIdentifier,
          event_type: 'Extension Detected',
          event_time: now,
          detection_source: 'Extension Inventory Import',
          confidence: 0.9,
          collection_status: 'Success',
          approval_status_at_detection: match.approval_status,
        });
      } else {
        unmatchedCount++;
      }
    }

    return {
      source: 'Extension Inventory Import',
      status: errors.length > 0 ? 'Partial' : 'Success',
      totalParsed,
      matchedCount,
      unmatchedCount,
      events,
      errors,
    };
  } catch (err) {
    return {
      source: 'Extension Inventory Import',
      status: 'Error',
      totalParsed,
      matchedCount: 0,
      unmatchedCount: 0,
      events: [],
      errors: [
        'Invalid JSON format. Expected array of objects with id, name, and permissions fields.',
      ],
    };
  }
}
