/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../services/authContext';
import { policyRepo } from '../../database/repositories/policyRepo';
import { userRepo, auditRepo } from '../../database/repositories/userRepo';
import { toolRepo } from '../../database/repositories/toolRepo';
import { scanRepo } from '../../database/repositories/scanRepo';
import { usageRepo } from '../../database/repositories/usageRepo';
import { reportRepo, settingsRepo } from '../../database/repositories/reportRepo';
import { incidentRepo } from '../../database/repositories/alertRepo';
import { getActiveScannerRules } from '../../scanner/scannerEngine';
import { Policy, SeverityLevel, ReportRecord } from '../../database/types';
import {
  BALANCED_TEMPLATE,
  STRICT_TEMPLATE,
  EDUCATION_TEMPLATE,
  ScannerRuleConfig,
  PolicyTemplate,
  DEFAULT_SCANNER_RULES,
  DEFAULT_CREDENTIAL_KEYWORDS,
  DEFAULT_HINGLISH_WORDS,
  DEFAULT_PLACEHOLDERS,
} from '../../core/defaultPolicies';
import { isSafeRegex } from '../../scanner/safeRegex';
import { Modal } from '../components/DataTable';
import { RiskBadge } from '../components/CommonUI';
import {
  generateUsageReportHtml,
  generateUsageReportPdf,
  exportReportFile,
} from '../../reports/reportGenerator';

export const PolicyPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  // Active Policies
  const toolPolicy = useMemo(() => policyRepo.getLatest('pol_tool_approval'), [refreshKey]);
  const dataPolicy = useMemo(() => policyRepo.getLatest('pol_data_categories'), [refreshKey]);
  const alertPolicy = useMemo(() => policyRepo.getLatest('pol_alert_thresholds'), [refreshKey]);
  const retentionPolicy = useMemo(() => policyRepo.getLatest('pol_retention'), [refreshKey]);

  // Active Tab: templates | categories | thresholds | retention | history | keywords
  const [activeTab, setActiveTab] = useState<'templates' | 'categories' | 'thresholds' | 'retention' | 'history' | 'keywords'>('categories');

  // Scanner Rules editing state - safely parse array, object with rules, or fallback to default rules
  const rulesList: ScannerRuleConfig[] = useMemo(() => {
    if (!dataPolicy || !dataPolicy.policy_json) return DEFAULT_SCANNER_RULES;
    try {
      const parsed = JSON.parse(dataPolicy.policy_json);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.rules)) return parsed.rules;
        if (Array.isArray(parsed.dataCategories)) return parsed.dataCategories;
        if (Array.isArray(parsed.categories)) return parsed.categories;
      }
      return DEFAULT_SCANNER_RULES;
    } catch {
      return DEFAULT_SCANNER_RULES;
    }
  }, [dataPolicy]);

  // Modal State for Rule Add/Edit
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [ruleId, setRuleId] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleRegex, setRuleRegex] = useState('');
  const [ruleFlags, setRuleFlags] = useState('g');
  const [ruleSeverity, setRuleSeverity] = useState<SeverityLevel>('High');
  const [ruleExplanation, setRuleExplanation] = useState('');
  const [ruleFalsePositiveNote, setRuleFalsePositiveNote] = useState('');
  const [ruleError, setRuleError] = useState<string | null>(null);

  // Keyword & Placeholder Settings State
  const [extraKeywordsInput, setExtraKeywordsInput] = useState('');
  const [credKeywordsInput, setCredKeywordsInput] = useState('');
  const [hinglishInput, setHinglishInput] = useState('');
  const [placeholdersInput, setPlaceholdersInput] = useState('');
  const [keywordsSavedMsg, setKeywordsSavedMsg] = useState<string | null>(null);

  // Success Notice
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const reload = () => {
    setRefreshKey(k => k + 1);
  };

  // Load configured dictionaries from settingsRepo or fallback to defaults
  useEffect(() => {
    try {
      const storedExtra = settingsRepo.get('extra_credential_keywords', '');
      const extraList = storedExtra ? JSON.parse(storedExtra) : [];
      setExtraKeywordsInput(Array.isArray(extraList) ? extraList.join(', ') : '');

      const storedCred = settingsRepo.get('credential_keywords', '');
      const credList = storedCred ? JSON.parse(storedCred) : DEFAULT_CREDENTIAL_KEYWORDS;
      setCredKeywordsInput(Array.isArray(credList) ? credList.join(', ') : DEFAULT_CREDENTIAL_KEYWORDS.join(', '));

      const storedHinglish = settingsRepo.get('hinglish_keywords', '');
      const hingList = storedHinglish ? JSON.parse(storedHinglish) : DEFAULT_HINGLISH_WORDS;
      setHinglishInput(Array.isArray(hingList) ? hingList.join(', ') : DEFAULT_HINGLISH_WORDS.join(', '));

      const storedPh = settingsRepo.get('known_placeholders', '');
      const phList = storedPh ? JSON.parse(storedPh) : DEFAULT_PLACEHOLDERS;
      setPlaceholdersInput(Array.isArray(phList) ? phList.join(', ') : DEFAULT_PLACEHOLDERS.join(', '));
    } catch {
      setExtraKeywordsInput('');
      setCredKeywordsInput(DEFAULT_CREDENTIAL_KEYWORDS.join(', '));
      setHinglishInput(DEFAULT_HINGLISH_WORDS.join(', '));
      setPlaceholdersInput(DEFAULT_PLACEHOLDERS.join(', '));
    }
  }, [refreshKey]);

  const handleSaveKeywords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const extraArr = extraKeywordsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const credArr = credKeywordsInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const hingArr = hinglishInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const phArr = placeholdersInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    await settingsRepo.set('extra_credential_keywords', JSON.stringify(extraArr));
    await settingsRepo.set('credential_keywords', JSON.stringify(credArr));
    await settingsRepo.set('hinglish_keywords', JSON.stringify(hingArr));
    await settingsRepo.set('known_placeholders', JSON.stringify(phArr));

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'POLICY_KEYWORDS_UPDATED',
      target_type: 'policy',
      target_id: 'settings_keywords',
      outcome: 'Success',
      details: `Updated detection dictionaries: ${extraArr.length} extra keywords, ${credArr.length} credential keywords, ${hingArr.length} Hinglish words, ${phArr.length} placeholders.`,
    });

    setKeywordsSavedMsg('Detection dictionaries and placeholders saved successfully!');
    setTimeout(() => setKeywordsSavedMsg(null), 3500);
    reload();
  };

  const handleResetKeywordsToDefault = async () => {
    if (!currentUser) return;
    if (!confirm('Reset all credential keywords, Hinglish words, and placeholders to default?')) return;

    await settingsRepo.set('extra_credential_keywords', JSON.stringify([]));
    await settingsRepo.set('credential_keywords', JSON.stringify(DEFAULT_CREDENTIAL_KEYWORDS));
    await settingsRepo.set('hinglish_keywords', JSON.stringify(DEFAULT_HINGLISH_WORDS));
    await settingsRepo.set('known_placeholders', JSON.stringify(DEFAULT_PLACEHOLDERS));

    setExtraKeywordsInput('');
    setCredKeywordsInput(DEFAULT_CREDENTIAL_KEYWORDS.join(', '));
    setHinglishInput(DEFAULT_HINGLISH_WORDS.join(', '));
    setPlaceholdersInput(DEFAULT_PLACEHOLDERS.join(', '));

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'POLICY_KEYWORDS_RESET',
      target_type: 'policy',
      target_id: 'settings_keywords',
      outcome: 'Success',
      details: 'Reset detection dictionaries and placeholders to factory defaults.',
    });

    setKeywordsSavedMsg('Reset keywords and placeholders to factory defaults.');
    setTimeout(() => setKeywordsSavedMsg(null), 3500);
    reload();
  };

  const handleApplyTemplate = async (template: PolicyTemplate) => {
    if (!currentUser) return;
    if (!confirm(`Apply the "${template.name}" template? This will update all policies to new versions.`)) return;

    await policyRepo.saveNewVersion({
      policy_id: 'pol_tool_approval',
      policy_name: 'Enterprise Tool Approval & Classification',
      policy_type: 'Tool Approval',
      policy_json: JSON.stringify(template.toolApprovalPolicy),
      enabled: true,
      updated_by: currentUser.username,
    });

    await policyRepo.saveNewVersion({
      policy_id: 'pol_data_categories',
      policy_name: 'Sensitive Data Category Scanner Rules',
      policy_type: 'Data Category',
      policy_json: JSON.stringify(template.dataCategories),
      enabled: true,
      updated_by: currentUser.username,
    });

    await policyRepo.saveNewVersion({
      policy_id: 'pol_alert_thresholds',
      policy_name: 'DLP Alert Generation Thresholds',
      policy_type: 'Alert Threshold',
      policy_json: JSON.stringify(template.alertThresholds),
      enabled: true,
      updated_by: currentUser.username,
    });

    await policyRepo.saveNewVersion({
      policy_id: 'pol_retention',
      policy_name: 'Data Purge & Retention Schedule',
      policy_type: 'Retention',
      policy_json: JSON.stringify(template.retention),
      enabled: true,
      updated_by: currentUser.username,
    });

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'POLICY_TEMPLATE_APPLIED',
      target_type: 'policy',
      target_id: 'all',
      outcome: 'Success',
      details: `Applied policy template "${template.name}". New version created for all 4 policy types.`,
    });

    setSuccessNotice(`Successfully applied "${template.name}" policy template!`);
    setTimeout(() => setSuccessNotice(null), 3500);
    reload();
  };

  const handleToggleRule = async (index: number) => {
    if (!currentUser || !dataPolicy) return;
    const updated = [...rulesList];
    updated[index].enabled = !updated[index].enabled;

    await policyRepo.saveNewVersion({
      policy_id: 'pol_data_categories',
      policy_name: dataPolicy.policy_name,
      policy_type: 'Data Category',
      policy_json: JSON.stringify(updated),
      enabled: true,
      updated_by: currentUser.username,
    });

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'POLICY_RULE_TOGGLED',
      target_type: 'policy',
      target_id: 'pol_data_categories',
      outcome: 'Success',
      details: `Toggled rule "${updated[index].rule_id}" to ${updated[index].enabled ? 'Enabled' : 'Disabled'}.`,
    });

    reload();
  };

  const handleDeleteRule = async (index: number) => {
    if (!currentUser || !dataPolicy) return;
    if (!confirm(`Delete rule "${rulesList[index].rule_id}"?`)) return;

    const deleted = rulesList[index];
    const updated = rulesList.filter((_, i) => i !== index);

    await policyRepo.saveNewVersion({
      policy_id: 'pol_data_categories',
      policy_name: dataPolicy.policy_name,
      policy_type: 'Data Category',
      policy_json: JSON.stringify(updated),
      enabled: true,
      updated_by: currentUser.username,
    });

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: 'POLICY_RULE_DELETED',
      target_type: 'policy',
      target_id: 'pol_data_categories',
      outcome: 'Success',
      details: `Deleted rule "${deleted.rule_id}".`,
    });

    reload();
  };

  const openAddRuleModal = () => {
    setEditingRuleIndex(null);
    setRuleId(`rule_custom_${Date.now()}`);
    setRuleCategory('Custom Organization Data');
    setRuleRegex('');
    setRuleFlags('g');
    setRuleSeverity('High');
    setRuleExplanation('Organization custom proprietary identifier pattern.');
    setRuleFalsePositiveNote('Internal serial or reference codes.');
    setRuleError(null);
    setIsRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: ScannerRuleConfig, idx: number) => {
    setEditingRuleIndex(idx);
    setRuleId(rule.rule_id);
    setRuleCategory(rule.category);
    setRuleRegex(rule.regex);
    setRuleFlags(rule.flags || 'g');
    setRuleSeverity(rule.severity);
    setRuleExplanation(rule.explanation);
    setRuleFalsePositiveNote(rule.falsePositiveNote);
    setRuleError(null);
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !dataPolicy) return;

    // Normalize flags (lowercase, valid JS regex flags, always include 'g')
    const cleanedFlags = (ruleFlags || 'g').toLowerCase().replace(/[^gimsuy]/g, '');
    const flagsSet = new Set(cleanedFlags.split(''));
    flagsSet.add('g');
    const normalizedFlags = Array.from(flagsSet).join('');

    // Validate safe regex against ReDoS catastrophic backtracking
    const check = isSafeRegex(ruleRegex, normalizedFlags);
    if (!check.safe) {
      setRuleError(`Regex validation failed: ${check.error}`);
      return;
    }

    const updated = [...rulesList];
    const newRule: ScannerRuleConfig = {
      rule_id: ruleId.trim(),
      category: ruleCategory.trim(),
      regex: ruleRegex.trim(),
      flags: normalizedFlags,
      severity: ruleSeverity,
      enabled: true,
      explanation: ruleExplanation.trim(),
      falsePositiveNote: ruleFalsePositiveNote.trim(),
    };

    if (editingRuleIndex !== null) {
      updated[editingRuleIndex] = newRule;
    } else {
      updated.push(newRule);
    }

    await policyRepo.saveNewVersion({
      policy_id: 'pol_data_categories',
      policy_name: dataPolicy.policy_name,
      policy_type: 'Data Category',
      policy_json: JSON.stringify(updated),
      enabled: true,
      updated_by: currentUser.username,
    });

    await auditRepo.log({
      user_id: currentUser.user_id,
      action: editingRuleIndex !== null ? 'POLICY_RULE_UPDATED' : 'POLICY_RULE_CREATED',
      target_type: 'policy',
      target_id: 'pol_data_categories',
      outcome: 'Success',
      details: `Saved rule "${newRule.rule_id}" (${newRule.category}) with severity ${newRule.severity}.`,
    });

    setIsRuleModalOpen(false);
    reload();
  };

  // Retention and Thresholds config getters
  const alertThresholdConfig = useMemo(() => {
    if (!alertPolicy) return { minSeverityForAlert: 'High', minRiskScoreForAlert: 50, autoEscalateCritical: true };
    try {
      return JSON.parse(alertPolicy.policy_json);
    } catch {
      return { minSeverityForAlert: 'High', minRiskScoreForAlert: 50, autoEscalateCritical: true };
    }
  }, [alertPolicy]);

  const retentionConfig = useMemo(() => {
    if (!retentionPolicy) return { eventRetentionDays: 90, findingRetentionDays: 180, auditLogRetentionDays: 365, reportRetentionDays: 365 };
    try {
      return JSON.parse(retentionPolicy.policy_json);
    } catch {
      return { eventRetentionDays: 90, findingRetentionDays: 180, auditLogRetentionDays: 365, reportRetentionDays: 365 };
    }
  }, [retentionPolicy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
            Security Policy & Rule Governance
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
            Immutable multi-version policies, ReDoS-safe DLP regex rules, and alert thresholds
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100 dark:bg-slate-900 rounded-xl self-start">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium'
            }`}
          >
            Scanner Rules ({rulesList.length})
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
              activeTab === 'templates'
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('thresholds')}
            className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
              activeTab === 'thresholds'
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium'
            }`}
          >
            Alert Thresholds
          </button>
          <button
            onClick={() => setActiveTab('retention')}
            className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
              activeTab === 'retention'
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium'
            }`}
          >
            Retention
          </button>
          <button
            onClick={() => setActiveTab('keywords')}
            className={`px-3.5 py-1.5 text-xs rounded-lg transition-all cursor-pointer ${
              activeTab === 'keywords'
                ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 shadow-xs font-bold'
                : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 font-medium'
            }`}
          >
            Keywords & Placeholders
          </button>
        </div>
      </div>

      {successNotice && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          {successNotice}
        </div>
      )}

      {/* Tab: Scanner Rules */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">
              Active Version: <strong className="text-gray-900 dark:text-slate-100">v{dataPolicy?.version || 1}</strong> &bull; Updated by <strong className="text-gray-900 dark:text-slate-100">{dataPolicy?.updated_by}</strong> on {new Date(dataPolicy?.updated_at || Date.now()).toLocaleDateString()}
            </div>
            <button
              onClick={openAddRuleModal}
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs flex items-center gap-1.5 self-start cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Custom Rule</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-slate-900/60 text-gray-700 dark:text-slate-300 font-bold border-b border-gray-200/80 dark:border-slate-700">
                  <th className="py-3 px-4 font-bold">Rule ID</th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Severity</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold">Pattern Regex</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60 text-gray-800 dark:text-slate-200">
                {Array.isArray(rulesList) && rulesList.length > 0 ? (
                  rulesList.map((r, idx) => (
                    <tr key={r.rule_id} className="hover:bg-gray-50/70 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#5B4DFB] dark:text-indigo-400">
                        {r.rule_id}
                      </td>
                      <td className="py-3 px-4 font-bold text-gray-900 dark:text-slate-100">
                        {r.category}
                      </td>
                      <td className="py-3 px-4">
                        <RiskBadge level={r.severity} size="sm" />
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleRule(idx)}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                            r.enabled
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-600'
                          }`}
                        >
                          {r.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] max-w-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-gray-700 dark:text-slate-300 font-medium truncate">{r.regex}</span>
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[10px] text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                            /{r.flags || 'g'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditRuleModal(r, idx)}
                            className="text-xs text-[#5B4DFB] dark:text-indigo-400 hover:underline font-bold cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteRule(idx)}
                            className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-bold ml-2 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 dark:text-slate-500 font-medium">
                      No custom scanner rules configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Templates */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-600 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 text-base">{BALANCED_TEMPLATE.name}</h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">
                {BALANCED_TEMPLATE.description}
              </p>
              <div className="mt-4 space-y-2 text-xs text-gray-700 dark:text-slate-300 font-medium">
                <div>&bull; Alert on High and Critical findings</div>
                <div>&bull; Default unreviewed tool status</div>
                <div>&bull; 90-day event retention schedule</div>
              </div>
            </div>
            <button
              onClick={() => handleApplyTemplate(BALANCED_TEMPLATE)}
              className="mt-6 w-full py-2.5 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Apply Balanced Template
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-600 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 text-base">{STRICT_TEMPLATE.name}</h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  High Defense
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">
                {STRICT_TEMPLATE.description}
              </p>
              <div className="mt-4 space-y-2 text-xs text-gray-700 dark:text-slate-300 font-medium">
                <div>&bull; Alert on Medium, High, and Critical findings</div>
                <div>&bull; Default restricted tool status</div>
                <div>&bull; 180-day event retention schedule</div>
              </div>
            </div>
            <button
              onClick={() => handleApplyTemplate(STRICT_TEMPLATE)}
              className="mt-6 w-full py-2.5 text-xs font-bold text-white bg-gray-900 dark:bg-indigo-600 hover:bg-gray-800 dark:hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Apply Strict Template
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:border-gray-300 dark:hover:border-slate-600 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 dark:text-slate-100 text-base">{EDUCATION_TEMPLATE.name}</h3>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  Permissive
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">
                {EDUCATION_TEMPLATE.description}
              </p>
              <div className="mt-4 space-y-2 text-xs text-gray-700 dark:text-slate-300 font-medium">
                <div>&bull; Alert on Critical secrets and cards only</div>
                <div>&bull; Permissive default tool classification</div>
                <div>&bull; 30-day lightweight retention schedule</div>
              </div>
            </div>
            <button
              onClick={() => handleApplyTemplate(EDUCATION_TEMPLATE)}
              className="mt-6 w-full py-2.5 text-xs font-bold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer"
            >
              Apply Education Template
            </button>
          </div>
        </div>
      )}

      {/* Tab: Alert Thresholds */}
      {activeTab === 'thresholds' && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xs max-w-xl">
          <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1">
            Automated Alert Generation Criteria
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-6 font-medium">
            Controls which findings and risk scores spawn immediate alert records.
          </p>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
                Minimum Finding Severity for Alert
              </label>
              <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 font-mono font-bold text-gray-900 dark:text-slate-100">
                {alertThresholdConfig.minSeverityForAlert}
              </div>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
                Minimum User Risk Score for Alert
              </label>
              <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 font-mono font-bold text-gray-900 dark:text-slate-100">
                {alertThresholdConfig.minRiskScoreForAlert}/100
              </div>
            </div>

            <div>
              <label className="block font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
                Auto-Escalate Critical Violations to Open Incident
              </label>
              <div className="p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 font-bold text-gray-900 dark:text-slate-100">
                {alertThresholdConfig.autoEscalateCritical ? 'Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Retention Schedule */}
      {activeTab === 'retention' && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xs max-w-xl">
          <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-1">
            Data Retention & Purge Configuration
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-6 font-medium">
            Configured lifecycle schedules for stored events, scans, and audit traces.
          </p>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-3.5 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">
              <span className="font-medium text-gray-600 dark:text-slate-400">Usage Telemetry Events Retention:</span>
              <strong className="font-mono font-bold text-gray-900 dark:text-slate-100">{retentionConfig.eventRetentionDays} Days</strong>
            </div>
            <div className="flex justify-between items-center p-3.5 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">
              <span className="font-medium text-gray-600 dark:text-slate-400">DLP Scans & Findings Retention:</span>
              <strong className="font-mono font-bold text-gray-900 dark:text-slate-100">{retentionConfig.findingRetentionDays} Days</strong>
            </div>
            <div className="flex justify-between items-center p-3.5 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">
              <span className="font-medium text-gray-600 dark:text-slate-400">Security Audit Logs Retention:</span>
              <strong className="font-mono font-bold text-gray-900 dark:text-slate-100">{retentionConfig.auditLogRetentionDays} Days</strong>
            </div>
            <div className="flex justify-between items-center p-3.5 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-slate-200">
              <span className="font-medium text-gray-600 dark:text-slate-400">Compliance Reports Retention:</span>
              <strong className="font-mono font-bold text-gray-900 dark:text-slate-100">{retentionConfig.reportRetentionDays} Days</strong>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Keywords & Placeholders */}
      {activeTab === 'keywords' && (
        <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-xs max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-150 dark:border-slate-700">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100">
                Proximity Dictionaries & Exclusions
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 font-medium">
                Configure credential triggers, romanized/Hinglish phrasing, and placeholder exclusions.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetKeywordsToDefault}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer"
            >
              Reset to Factory Defaults
            </button>
          </div>

          {keywordsSavedMsg && (
            <div className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              {keywordsSavedMsg}
            </div>
          )}

          <form onSubmit={handleSaveKeywords} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Extra Credential Keywords (Comma-Separated)
              </label>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
                Custom organization-specific credential keywords supplied directly to context detection (e.g. internal_key, project_token, vault_secret). Default is empty.
              </p>
              <textarea
                value={extraKeywordsInput}
                onChange={(e) => setExtraKeywordsInput(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="internal_token, project_auth, client_vault..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Credential Trigger Keywords (Comma-Separated)
              </label>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
                Triggers candidate token inspection when positioned within 60 characters before or after on the same line or sentence.
              </p>
              <textarea
                value={credKeywordsInput}
                onChange={(e) => setCredKeywordsInput(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="api key, apikey, password, token, secret..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Hinglish / Romanized Phrasing Keywords (Comma-Separated)
              </label>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
                Romanized Hindi/Urdu context words (e.g. "meri api key ye hai", "password hai", "token ye raha").
              </p>
              <textarea
                value={hinglishInput}
                onChange={(e) => setHinglishInput(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="meri, mera, mere, ye, yeh, hai, raha, hoga..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Known Dummy Placeholders & Exclusions (Exact Match Only)
              </label>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-2">
                Exact values matching these tokens are never flagged or reported (substring matches like "sk-test1234" are always retained).
              </p>
              <textarea
                value={placeholdersInput}
                onChange={(e) => setPlaceholdersInput(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                placeholder="changeme, your_api_key, example, test123, <api_key>..."
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Save Dictionaries & Placeholders
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Add / Edit Rule Modal */}
      <Modal
        isOpen={isRuleModalOpen}
        onClose={() => setIsRuleModalOpen(false)}
        title={editingRuleIndex !== null ? 'Edit Scanner Rule' : 'Add Custom Scanner Pattern'}
        subtitle="Regex patterns are evaluated locally with automated catastrophic backtracking (ReDoS) guardrails."
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          {ruleError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-800 dark:text-rose-300">
              {ruleError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Rule Identifier
            </label>
            <input
              type="text"
              required
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
              placeholder="e.g. rule_project_code"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-mono text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Category Name
              </label>
              <input
                type="text"
                required
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
                placeholder="e.g. Internal Project Code"
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Severity Level
              </label>
              <select
                value={ruleSeverity}
                onChange={(e) => setRuleSeverity(e.target.value as SeverityLevel)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none font-semibold"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Regular Expression Pattern
              </label>
              <input
                type="text"
                required
                value={ruleRegex}
                onChange={(e) => setRuleRegex(e.target.value)}
                placeholder="e.g. \\bPROJ-[A-Z0-9]{6}\\b"
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-mono text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Regex Flags
              </label>
              <input
                type="text"
                value={ruleFlags}
                onChange={(e) => setRuleFlags(e.target.value)}
                placeholder="e.g. g, gi, gim"
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl font-mono text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none"
              />
              <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 block">
                Flag "g" is always enforced.
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Explanation (Metadata displayed to user upon match)
            </label>
            <input
              type="text"
              required
              value={ruleExplanation}
              onChange={(e) => setRuleExplanation(e.target.value)}
              placeholder="e.g. Detected classified internal project identifier."
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              False Positive Note
            </label>
            <input
              type="text"
              value={ruleFalsePositiveNote}
              onChange={(e) => setRuleFalsePositiveNote(e.target.value)}
              placeholder="e.g. Public issue trackers or standard tickets."
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsRuleModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Save Rule (Creates v{((dataPolicy?.version || 1) + 1)})
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const ReportsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const reportRecords = useMemo(() => {
    return reportRepo.getAll();
  }, [refreshKey]);

  const canExport = currentUser?.role === 'Administrator' || currentUser?.role === 'Analyst' || currentUser?.role === 'Auditor';

  const handleGenerateComplianceReport = async (format: 'html' | 'pdf') => {
    if (!currentUser || !canExport) return;

    const allTools = toolRepo.getAll();
    const allFindings = scanRepo.getFindings();
    const allEvents = usageRepo.getAll();

    // Group categories
    const catMap: Record<string, number> = {};
    const severityCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };

    allFindings.forEach((f) => {
      catMap[f.category] = (catMap[f.category] || 0) + 1;
      if (severityCounts[f.severity as SeverityLevel] !== undefined) {
        severityCounts[f.severity as SeverityLevel]++;
      }
    });

    const categoriesDetected = Object.entries(catMap).map(([category, count]) => ({
      category,
      count,
    }));

    const allIncidents = incidentRepo.getAll();
    const policyRecord = policyRepo.getLatest('pol_data_categories');
    const activeRulesSummary = getActiveScannerRules(policyRecord?.policy_json, policyRecord?.version);
    const totalScans = scanRepo.getScanSessions().length;

    const reportId = `GOV-${Date.now().toString().slice(-6)}`;
    const data = {
      reportId,
      generatedAt: new Date().toISOString(),
      generatedBy: currentUser.username,
      reportingPeriod: 'Comprehensive Audit (All Time)',
      totalTools: allTools.length,
      approvedCount: allTools.filter((t) => t.approval_status === 'Approved').length,
      unreviewedCount: allTools.filter((t) => t.approval_status === 'Unreviewed').length,
      restrictedCount: allTools.filter((t) => t.approval_status === 'Restricted').length,
      totalEvents: allEvents.length,
      totalFindings: allFindings.length,
      categoriesDetected,
      riskDistribution: severityCounts,
      toolList: allTools,
      incidentList: allIncidents,
      activeRulesCount: activeRulesSummary.totalCount,
      totalScansCount: totalScans,
      telemetryLimitations: [
        'Browser Integration: Unsupported in standard browser sandbox without managed agent.',
        'Extension permissions reflect declared capabilities, not confirmed prompt access.',
      ],
      recommendations: [
        'Establish clear institutional guidelines designating approved enterprise AI environments.',
        'Enforce local in-browser DLP scanning prior to developer pasting code or configs into LLMs.',
        'Conduct bi-monthly audit of unreviewed tools detected in workstation process inventories.',
      ],
    };

    const fileName = `PromptShield_AI_Compliance_${reportId}.${format}`;

    if (format === 'html') {
      const html = generateUsageReportHtml(data);
      await exportReportFile({
        reportType: 'AI Usage Compliance',
        fileName,
        format: 'html',
        content: html,
        generatedByUserId: currentUser.user_id,
      });
    } else {
      const pdfBytes = generateUsageReportPdf(data);
      await exportReportFile({
        reportType: 'AI Usage Compliance',
        fileName,
        format: 'pdf',
        content: pdfBytes,
        generatedByUserId: currentUser.user_id,
      });
    }

    setRefreshKey(k => k + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
            Compliance & Incident Reports
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
            Cryptographically hashed (SHA-256) executive compliance exports. 100% devoid of raw secrets or prompt contents.
          </p>
        </div>

        {canExport && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGenerateComplianceReport('pdf')}
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export Compliance PDF</span>
            </button>
            <button
              onClick={() => handleGenerateComplianceReport('html')}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              Export HTML
            </button>
          </div>
        )}
      </div>

      {/* Reports History Table */}
      <div className="bg-white dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200/80 dark:border-slate-700">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
            Exported Report Ledger & Cryptographic Registry
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-slate-900/60 text-gray-700 dark:text-slate-300 font-bold border-b border-gray-200/80 dark:border-slate-700">
                <th className="py-3 px-4 font-bold">Report File Name</th>
                <th className="py-3 px-4 font-bold">Classification Type</th>
                <th className="py-3 px-4 font-bold">Generated By</th>
                <th className="py-3 px-4 font-bold">Generated (UTC)</th>
                <th className="py-3 px-4 font-bold">SHA-256 Digest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60 text-gray-800 dark:text-slate-200">
              {reportRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-400 dark:text-slate-500 font-medium">
                    No reports exported yet. Click "Export Compliance PDF" above to generate your first audit record.
                  </td>
                </tr>
              ) : (
                reportRecords.map((r: any) => (
                  <tr key={r.report_id} className="hover:bg-gray-50/70 dark:hover:bg-slate-700/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#5B4DFB] dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>{r.file_name}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-700 dark:text-slate-300 font-medium">
                      {r.report_type}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-600 dark:text-slate-400 font-medium">
                      {r.generated_by}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-500 dark:text-slate-400">
                      {new Date(r.generated_at).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-400 dark:text-slate-500 max-w-xs truncate" title={r.sha256_hash}>
                      {r.sha256_hash.slice(0, 20)}...
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
