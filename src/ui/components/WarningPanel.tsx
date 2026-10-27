/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ScanResult } from '../../scanner/scannerEngine';
import { RiskBadge } from './CommonUI';
import { SeverityLevel } from '../../database/types';

export const WarningPanel: React.FC<{
  scanResult: ScanResult;
  onProceedToRedact: () => void;
  onClear: () => void;
}> = ({ scanResult, onProceedToRedact, onClear }) => {
  const isPartial = scanResult.scan_status === 'Partial' || (scanResult.failedRuleIds && scanResult.failedRuleIds.length > 0);
  const failureText =
    scanResult.failureMessage ||
    (scanResult.failedRuleIds && scanResult.failedRuleIds.length > 0
      ? `Partial scan: rule ${scanResult.failedRuleIds.join(', ')} failed`
      : 'Partial scan');

  if (scanResult.totalMatches === 0) {
    if (isPartial) {
      return (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl p-5 mb-6 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                {failureText}
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {scanResult.disclaimer}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-5 mb-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
              No configured sensitive patterns matched
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              Zero PII or credentials detected in this payload. Note: pattern detection is an airgapped guardrail, always practice caution with confidential IP.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-rose-200/90 dark:border-rose-900/60 rounded-2xl p-6 shadow-xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-150 dark:border-slate-700 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-slate-100">
                Sensitive Data Patterns Detected ({scanResult.totalMatches})
              </h3>
              <RiskBadge level={scanResult.highestSeverity} size="sm" />
              {isPartial ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  {failureText}
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Audit Completed
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Evaluated {scanResult.matches.length} detection zones in {scanResult.durationMs}ms locally.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-slate-700 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors cursor-pointer"
          >
            Clear Text
          </button>
          <button
            onClick={onProceedToRedact}
            className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>Review & Redact</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {isPartial && (
        <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{failureText} &mdash; some rules could not complete execution.</span>
        </div>
      )}

      {/* Category-Grouped Findings Summary - NEVER prints secret contents! */}
      <div className="mt-4 space-y-3">
        {(() => {
          const categoryMap = new Map<
            string,
            {
              category: string;
              matches: typeof scanResult.matches;
              count: number;
              highestSeverity: SeverityLevel;
              primaryRuleId: string;
              alsoMatchedRuleIds: string[];
              explanation: string;
              falsePositiveNote: string;
            }
          >();

          const severityRank: Record<SeverityLevel, number> = {
            Low: 1,
            Medium: 2,
            High: 3,
            Critical: 4,
          };

          for (const m of scanResult.matches) {
            const existing = categoryMap.get(m.category);
            if (!existing) {
              categoryMap.set(m.category, {
                category: m.category,
                matches: [m],
                count: 1,
                highestSeverity: m.severity,
                primaryRuleId: m.rule_id,
                alsoMatchedRuleIds: [...(m.alsoMatchedRuleIds || [])],
                explanation: m.explanation,
                falsePositiveNote: m.falsePositiveNote || '',
              });
            } else {
              existing.matches.push(m);
              existing.count += 1;
              if (severityRank[m.severity] > severityRank[existing.highestSeverity]) {
                existing.highestSeverity = m.severity;
                existing.primaryRuleId = m.rule_id;
                existing.explanation = m.explanation;
                if (m.falsePositiveNote) existing.falsePositiveNote = m.falsePositiveNote;
              }
              if (m.alsoMatchedRuleIds) {
                for (const rid of m.alsoMatchedRuleIds) {
                  if (!existing.alsoMatchedRuleIds.includes(rid)) {
                    existing.alsoMatchedRuleIds.push(rid);
                  }
                }
              }
            }
          }

          const groups = Array.from(categoryMap.values()).sort(
            (a, b) => (severityRank[b.highestSeverity] || 0) - (severityRank[a.highestSeverity] || 0)
          );

          return groups.map((group) => (
            <div
              key={group.category}
              className="p-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-gray-900 dark:text-slate-100">
                    {group.category}: {group.count}
                  </h4>
                  <RiskBadge level={group.highestSeverity} size="sm" />
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-gray-500 dark:text-slate-400 font-medium">Rule:</span>
                  <span className="font-mono font-bold text-[#5B4DFB] dark:text-indigo-400">
                    {group.primaryRuleId}
                  </span>
                  {group.alsoMatchedRuleIds.length > 0 && (
                    <span className="text-gray-500 dark:text-slate-400">
                      (also matched: {group.alsoMatchedRuleIds.join(', ')})
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-800 dark:text-slate-200 font-medium">
                {group.explanation}
              </div>

              {group.falsePositiveNote && (
                <div className="mt-2 text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  <span className="font-bold">False-positive note:</span> {group.falsePositiveNote}
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400 font-mono">
                <span>Detected {group.matches.length > 1 ? 'offsets' : 'offset'}:</span>
                {group.matches.map((m, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200 font-semibold"
                  >
                    chars {m.start}–{m.end}
                  </span>
                ))}
              </div>
            </div>
          ));
        })()}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-150 dark:border-slate-700 text-[11px] text-gray-500 dark:text-slate-400">
        {scanResult.disclaimer}
      </div>
    </div>
  );
};
