/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../services/authContext';
import { toolRepo } from '../../database/repositories/toolRepo';
import { policyRepo } from '../../database/repositories/policyRepo';
import { scanRepo } from '../../database/repositories/scanRepo';
import { settingsRepo } from '../../database/repositories/reportRepo';
import { alertService } from '../../core/alertService';
import { scanTextAsync, ScanResult, getActiveScannerRules } from '../../scanner/scannerEngine';
import { redactText, RedactionResult } from '../../redaction/redactionEngine';
import { PrivacyBanner } from '../components/CommonUI';
import { WarningPanel } from '../components/WarningPanel';
import { RedactionCard } from '../components/RedactionCard';
import { readClipboardSafe } from '../../clipboard/clipboardScanner';
import { ScannerRuleConfig } from '../../core/defaultPolicies';

export const ScanTextPage: React.FC<{
  initialText?: string;
  onClearExternal?: () => void;
}> = ({ initialText = '', onClearExternal }) => {
  const { currentUser } = useAuth();
  const [text, setText] = useState(initialText);
  const [targetToolId, setTargetToolId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [redactionResult, setRedactionResult] = useState<RedactionResult | null>(null);
  const [activeScanId, setActiveScanId] = useState<string>('');
  const [showRedactionView, setShowRedactionView] = useState(false);

  // Dynamically load only approved AI tools configured by Admin from SQLite
  const approvedTools = useMemo(() => toolRepo.getApprovedTools(), []);

  // Update text if initialText changes (e.g. from clipboard scan)
  useEffect(() => {
    if (initialText) {
      setText(initialText);
    }
  }, [initialText]);

  // Clear state when user navigates away or unmounts (Privacy Invariant)
  useEffect(() => {
    return () => {
      setText('');
      setScanResult(null);
      setRedactionResult(null);
      setActiveScanId('');
    };
  }, []);

  const handleClear = () => {
    setText('');
    setScanResult(null);
    setRedactionResult(null);
    setActiveScanId('');
    setShowRedactionView(false);
    if (onClearExternal) onClearExternal();
  };

  const catPolicy = useMemo(() => policyRepo.getLatest('pol_data_categories'), [activeScanId]);
  const activeRulesSummary = useMemo(() => {
    return getActiveScannerRules(
      catPolicy?.enabled ? catPolicy.policy_json : null,
      catPolicy?.version || 1
    );
  }, [catPolicy]);

  const extraKeywords = useMemo(() => {
    try {
      const stored = settingsRepo.get('extra_credential_keywords', '');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const handleScan = async () => {
    if (!text.trim() || !currentUser) return;
    setIsScanning(true);
    setScanResult(null);
    setRedactionResult(null);

    try {
      // 1. Fetch active data categories policy rules safely merged with defaults
      const rules: ScannerRuleConfig[] = activeRulesSummary.rules;
      const customIdRegex = settingsRepo.get('custom_id_regex', '');

      // 2. Run local scanner with primary context detector + fallback rules
      const result = await scanTextAsync(text, rules, customIdRegex, extraKeywords);
      setScanResult(result);

      // 3. Record scan session metadata (strictly metadata only!)
      const session = await scanRepo.recordScanSession({
        user_id: currentUser.user_id,
        tool_id: targetToolId || null,
        scan_time: new Date().toISOString(),
        scan_source: 'Manual Text',
        detected_count: result.totalMatches,
        categories_json: JSON.stringify(result.categories),
        highest_risk: result.highestSeverity,
        scan_status: result.scan_status,
      });
      setActiveScanId(session.scan_id);

      // 4. Record findings and evaluate alerts if matches found
      if (result.matches.length > 0) {
        // Group matches by category: one finding per (scan, category)
        const categoryGroups = new Map<string, typeof result.matches>();
        for (const m of result.matches) {
          const list = categoryGroups.get(m.category) || [];
          list.push(m);
          categoryGroups.set(m.category, list);
        }

        const severityRank: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

        const findingsToCreate = Array.from(categoryGroups.entries()).map(([cat, mList]) => {
          mList.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));
          const primary = mList[0];

          return {
            scan_id: session.scan_id,
            usage_event_id: null,
            user_id: currentUser.user_id,
            tool_id: targetToolId || null,
            category: cat,
            match_count: mList.length,
            rule_id: primary.rule_id,
            severity: primary.severity,
            explanation: primary.explanation,
            false_positive_note: primary.falsePositiveNote || '',
            created_at: new Date().toISOString(),
            status: 'New' as const,
            action_taken: 'Warned' as const,
            policy_version: activeRulesSummary.policyVersion,
          };
        });

        const recordedFindings = await scanRepo.recordFindings(findingsToCreate);

        // Call alert service ONCE per scan session
        await alertService.evaluateScanForAlert(session, recordedFindings, targetToolId || null);

        // Prepare redaction result
        const redRes = redactText(text, result.matches);
        setRedactionResult(redRes);
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
            Local Prompt & Data Scanner
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
            Evaluate text payloads against local DLP patterns before sending to external AI models
          </p>
        </div>

        {/* Mandatory Destination Tool Selector (Approved Tools Only) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
            <span>Target AI</span>
            <span className="text-rose-500 font-extrabold">*</span>
            <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold normal-case ml-1 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
              Admin Approved Only
            </span>
          </label>
          <select
            required
            aria-required="true"
            value={targetToolId}
            onChange={(e) => setTargetToolId(e.target.value)}
            className={`px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-2 font-semibold shadow-2xs transition-all ${
              !targetToolId
                ? 'bg-amber-50/70 dark:bg-amber-950/40 border-2 border-amber-400/80 dark:border-amber-600 text-amber-900 dark:text-amber-200 focus:ring-amber-500/30'
                : 'bg-white dark:bg-slate-800 border border-teal-500/50 dark:border-teal-500 text-gray-900 dark:text-slate-100 focus:ring-teal-500/20'
            }`}
          >
            <option value="">-- Mandatory: Select Approved Target AI --</option>
            {approvedTools.map((t) => (
              <option key={t.tool_id} value={t.tool_id}>
                ✓ {t.tool_name} ({t.category})
              </option>
            ))}
          </select>
        </div>
      </div>

      {approvedTools.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
          <span>
            <strong>Warning:</strong> No AI tools are currently set to "Approved" in the database. An Administrator must approve at least one AI tool in the Inventory before prompts can be scanned.
          </span>
        </div>
      )}

      <PrivacyBanner />

      {/* Redaction View if Active */}
      {showRedactionView && redactionResult ? (
        <RedactionCard
          originalText={text}
          redactionResult={redactionResult}
          scanId={activeScanId}
          onClear={handleClear}
          onCancel={() => setShowRedactionView(false)}
        />
      ) : (
        <>
          {/* Text Area Box */}
          <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Prompt Payload or Code Fragment
              </label>
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 font-mono font-medium">
                <span>{text.length} characters</span>
                <span>•</span>
                <span>{text.split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>

            <textarea
              rows={9}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text, code snippets, database queries, configurations, or credentials here to scan for sensitive exposure..."
              className="w-full p-4 font-mono text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 leading-relaxed transition-all"
            />

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
                  Luhn checksum filter for cards · National IDs · API keys & PEM certificates · Passwords
                </span>
                {!targetToolId && text.trim() && (
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                    ⚠️ Mandatory: You must select an approved Target AI above before scanning or submitting.
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={!text && !scanResult}
                    className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleScan}
                    disabled={!text.trim() || !targetToolId || isScanning}
                    title={
                      !targetToolId
                        ? 'Select an approved Target AI from the dropdown above to enable scanning'
                        : !text.trim()
                        ? 'Enter text to scan'
                        : 'Scan text locally against DLP policies'
                    }
                    className={`px-5 py-2 text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-2 ${
                      !text.trim() || !targetToolId || isScanning
                        ? 'bg-gray-300 dark:bg-slate-700 text-gray-500 dark:text-slate-400 cursor-not-allowed opacity-60'
                        : 'bg-teal-600 hover:bg-teal-500 text-slate-950 font-extrabold shadow-md shadow-teal-500/20 cursor-pointer active:scale-98'
                    }`}
                  >
                    {isScanning ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                        <span>Scanning Patterns...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>
                          {!targetToolId ? 'Select Target AI to Scan' : 'Scan / Submit Payload'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
                <span className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
                  Active rules: {activeRulesSummary.totalCount} (policy v{activeRulesSummary.policyVersion}, rules v{activeRulesSummary.rulesVersion})
                </span>
              </div>
            </div>
          </div>

          {/* Results Warning Panel */}
          {scanResult && (
            <WarningPanel
              scanResult={scanResult}
              onProceedToRedact={() => setShowRedactionView(true)}
              onClear={handleClear}
            />
          )}
        </>
      )}
    </div>
  );
};

export const ScanClipboardPage: React.FC = () => {
  const [clipboardText, setClipboardText] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const catPolicy = useMemo(() => policyRepo.getLatest('pol_data_categories'), []);
  const activeRulesSummary = useMemo(() => {
    return getActiveScannerRules(
      catPolicy?.enabled ? catPolicy.policy_json : null,
      catPolicy?.version || 1
    );
  }, [catPolicy]);

  // Clear clipboard derived state on unmount
  useEffect(() => {
    return () => {
      setClipboardText('');
      setErrorMessage(null);
    };
  }, []);

  const handleReadAndScan = async () => {
    setIsReading(true);
    setErrorMessage(null);

    const result = await readClipboardSafe();
    setIsReading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to read clipboard.');
      return;
    }

    if (!result.text || !result.text.trim()) {
      setErrorMessage('Clipboard is currently empty or does not contain text.');
      return;
    }

    setClipboardText(result.text);
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-gray-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
          Scan Clipboard Safeguard
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
          Explicit user-initiated clipboard inspection. Zero background polling or keylogging.
        </p>
      </div>

      <PrivacyBanner />

      {!clipboardText ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-10 text-center shadow-xs">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-slate-100">
            Inspect Clipboard for Sensitive Leakage
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 max-w-lg mx-auto mt-1.5 mb-6 leading-relaxed">
            Clicking the button reads your active OS clipboard buffer once into local browser memory to scan for API keys, passwords, and IDs before pasting into external AI tools.
          </p>

          {errorMessage && (
            <div className="max-w-md mx-auto mb-6 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium text-left">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col items-center gap-2.5">
            <button
              onClick={handleReadAndScan}
              disabled={isReading}
              className="px-6 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors disabled:opacity-50 inline-flex items-center gap-2 cursor-pointer"
            >
              {isReading ? (
                <span>Reading Clipboard...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>Read & Scan Clipboard Now</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
              Active rules: {activeRulesSummary.totalCount} (policy v{activeRulesSummary.policyVersion}, rules v{activeRulesSummary.rulesVersion})
            </span>
          </div>
        </div>
      ) : (
        <ScanTextPage
          initialText={clipboardText}
          onClearExternal={() => setClipboardText('')}
        />
      )}
    </div>
  );
};
