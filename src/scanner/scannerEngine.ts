/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidLuhn } from './luhn';
import {
  ScannerRuleConfig,
  DEFAULT_CREDENTIAL_KEYWORDS,
  DEFAULT_HINGLISH_WORDS,
  DEFAULT_PLACEHOLDERS,
  DEFAULT_SCANNER_RULES,
  RULES_VERSION,
} from '../core/defaultPolicies';
import { SeverityLevel } from '../database/types';
import { settingsRepo } from '../database/repositories/reportRepo';
import { detectAll, Hit, Category as ContextCategory } from './contextDetector';

export type PlaceholderKind =
  | 'cnic'
  | 'email'
  | 'api_key'
  | 'password'
  | 'card'
  | 'confidential'
  | 'possible_secret'
  | 'phone'
  | 'iban'
  | 'custom';

export interface ScanMatchOffset {
  rule_id: string;
  category: string;
  severity: SeverityLevel;
  start: number;
  end: number;
  explanation: string;
  falsePositiveNote: string;
  placeholderType: PlaceholderKind;
  keyPrefix?: string; // e.g. "api_key=" to preserve key name while redacting value
  alsoMatchedRuleIds?: string[];
}

export interface ScanResult {
  scan_status: 'Completed' | 'Partial' | 'Failed';
  totalMatches: number;
  categories: string[];
  categoryCounts: Record<string, number>;
  highestSeverity: SeverityLevel | 'None';
  matches: ScanMatchOffset[]; // NEVER contains matched secret values
  ruleMatches: Record<string, number>;
  durationMs: number;
  disclaimer: string;
  failedRuleIds?: string[];
  failureMessage?: string;
}

/**
 * Checks if a candidate secret is an exact placeholder match.
 * Never uses substring matching so e.g. "sk-test1234" is still detected.
 */
export function isPlaceholder(val: string, customPlaceholders?: string[]): boolean {
  if (!val) return true;
  let trimmed = val.trim();
  // Strip outer quotes if any
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  const lower = trimmed.toLowerCase();
  if (lower.length === 0) return true;

  const placeholders = customPlaceholders || DEFAULT_PLACEHOLDERS;
  for (const ph of placeholders) {
    if (lower === ph.toLowerCase()) {
      return true; // Exact match only
    }
  }

  // All x's, asterisks, dashes, dots
  if (/^x+$/i.test(lower) || /^\*+$/.test(lower) || /^-+$/.test(lower) || /^\.+$/.test(lower)) {
    return true;
  }

  // Bracketed placeholders e.g. <ANY_KEY>, {API_KEY}
  if (/^<[a-z0-9_ -]+>$/i.test(lower) || /^\{[a-z0-9_ -]+\}$/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Calculates Shannon entropy for a given string
 */
export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies: Record<string, number> = {};
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  let entropy = 0;
  const len = str.length;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Returns regex flags guaranteed to include 'g'
 */
export function getRuleFlags(rule: ScannerRuleConfig): string {
  const raw = (rule.flags || 'g').trim();
  const set = new Set(raw.toLowerCase().split(''));
  set.add('g'); // always include 'g'
  return Array.from(set)
    .filter(f => ['g', 'i', 'm', 's', 'u', 'y'].includes(f))
    .join('');
}

/**
 * Compiles a safe RegExp using rule.flags, sanitizing any legacy inline (?i) or (?m)
 */
export function compileRuleRegex(rule: ScannerRuleConfig): RegExp {
  let pattern = rule.regex;
  let flags = getRuleFlags(rule);

  if (pattern.includes('(?i)')) {
    pattern = pattern.replace(/\(\?i\)/g, '');
    if (!flags.includes('i')) flags += 'i';
  }
  if (pattern.includes('(?m)')) {
    pattern = pattern.replace(/\(\?m\)/g, '');
    if (!flags.includes('m')) flags += 'm';
  }

  return new RegExp(pattern, flags);
}

export interface ActiveRulesSummary {
  rules: ScannerRuleConfig[];
  policyVersion: number;
  rulesVersion: number;
  totalCount: number;
}

/**
 * Builds active rule list as: stored rules merged with DEFAULT_SCANNER_RULES
 * for any rule_id that is missing or fails to compile.
 * Prevents stale or corrupted policies from ever silently disabling detection.
 */
export function getActiveScannerRules(
  storedPolicyJson?: string | null,
  policyVersion = 1
): ActiveRulesSummary {
  let storedRules: ScannerRuleConfig[] = [];
  let rulesVersion = 1;

  if (storedPolicyJson) {
    try {
      const parsed = JSON.parse(storedPolicyJson);
      if (Array.isArray(parsed)) {
        storedRules = parsed;
        rulesVersion = 1;
      } else if (parsed && typeof parsed === 'object') {
        storedRules = Array.isArray(parsed.rules) ? parsed.rules : [];
        rulesVersion = typeof parsed.rules_version === 'number' ? parsed.rules_version : RULES_VERSION;
      }
    } catch {
      storedRules = [];
    }
  }

  const activeMap = new Map<string, ScannerRuleConfig>();

  for (const r of storedRules) {
    if (!r || !r.rule_id) continue;
    try {
      new RegExp(r.regex, r.flags || 'g');
      activeMap.set(r.rule_id, r);
    } catch {
      // rule failed to compile -> will be replaced by default below
    }
  }

  // Merge in DEFAULT_SCANNER_RULES for any rule_id missing or that failed to compile
  for (const defRule of DEFAULT_SCANNER_RULES) {
    if (!activeMap.has(defRule.rule_id)) {
      activeMap.set(defRule.rule_id, { ...defRule });
    }
  }

  const rules = Array.from(activeMap.values());
  return {
    rules,
    policyVersion,
    rulesVersion,
    totalCount: rules.length,
  };
}

/**
 * Normalizes input text before scanning while preserving original offset mapping.
 * Strips zero-width characters and collapses repeated horizontal whitespace.
 */
export function normalizeInputText(text: string): {
  normalized: string;
  origIndices: number[];
  mapToOriginal: (normStart: number, normEnd: number) => { start: number; end: number };
} {
  const origIndices: number[] = [];
  let normalized = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    // Strip zero-width characters (ZWSP, ZWNJ, ZWJ, BOM, LRM, RLM)
    if (
      code === 0x200b ||
      code === 0x200c ||
      code === 0x200d ||
      code === 0xfeff ||
      code === 0x200e ||
      code === 0x200f
    ) {
      continue;
    }

    // Collapse repeated horizontal spaces/tabs
    if ((ch === ' ' || ch === '\t') && normalized.length > 0) {
      const prevNorm = normalized[normalized.length - 1];
      if (prevNorm === ' ') {
        continue;
      }
    }

    origIndices.push(i);
    normalized += ch;
  }
  origIndices.push(text.length);

  const mapToOriginal = (normStart: number, normEnd: number) => {
    const start = origIndices[Math.min(normStart, origIndices.length - 1)] ?? normStart;
    const end = origIndices[Math.min(normEnd, origIndices.length - 1)] ?? normEnd;
    return { start, end };
  };

  return { normalized, origIndices, mapToOriginal };
}

/**
 * Determines whether a token qualifies as a candidate credential value.
 * A candidate is a token of 6+ chars that has at least one letter AND one digit,
 * or mixed case plus a symbol, or 20+ chars with Shannon entropy > 3.5.
 * Plain English words and plain numbers are NOT candidates.
 */
export function isCandidateValue(token: string, placeholders?: string[]): boolean {
  if (!token) return false;
  let val = token.trim();

  // Strip outer quotes
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith('`') && val.endsWith('`'))
  ) {
    val = val.slice(1, -1).trim();
  }
  // Strip trailing punctuation
  val = val.replace(/[.,;:!?]+$/, '').trim();

  if (val.length < 6) return false;

  // Exact placeholder check
  if (isPlaceholder(val, placeholders)) return false;

  // 1. At least one letter AND at least one digit
  const hasLetter = /[a-zA-Z]/.test(val);
  const hasDigit = /\d/.test(val);
  if (hasLetter && hasDigit) {
    return true;
  }

  // 2. Mixed case plus a symbol (e.g. MyP@ssword, Secret#Key)
  const hasLower = /[a-z]/.test(val);
  const hasUpper = /[A-Z]/.test(val);
  const hasSymbol = /[^a-zA-Z0-9\s]/.test(val);
  if (hasLower && hasUpper && hasSymbol) {
    return true;
  }

  // 3. 20+ char token with Shannon entropy above 3.5
  if (val.length >= 20 && calculateShannonEntropy(val) > 3.5) {
    return true;
  }

  return false;
}

const SEVERITY_WEIGHTS: Record<SeverityLevel, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export function getExplanationForHit(category: ContextCategory, rule: string): string {
  switch (category) {
    case 'Password/API Key':
    case 'API Keys & Secrets':
      return `Detected sensitive credential or secret key (${rule}).`;
    case 'National ID':
      return `Detected national identity document number (${rule}).`;
    case 'Personal ID':
      return `Detected personal identity identifier (${rule}).`;
    case 'Phone Number':
      return `Detected personal phone number exposure (${rule}).`;
    case 'Bank Account / IBAN':
      return `Detected bank account or IBAN identifier (${rule}).`;
    case 'Payment Cards':
      return `Detected payment card number (${rule}).`;
    case 'Email Lists':
      return `Detected email address exposure (${rule}).`;
    case 'Passport':
      return `Detected passport document identifier (${rule}).`;
    case 'SSN':
      return `Detected Social Security Number identifier (${rule}).`;
    case 'Date of Birth':
      return `Detected date of birth exposure (${rule}).`;
    case 'Confidentiality Labels':
      return `Detected document confidentiality marking (${rule}).`;
    default:
      return `Detected sensitive pattern match (${rule}).`;
  }
}

export function getPlaceholderTypeForCategory(category: ContextCategory): PlaceholderKind {
  switch (category) {
    case 'National ID':
    case 'Personal ID':
    case 'Passport':
    case 'SSN':
      return 'cnic';
    case 'Email Lists':
      return 'email';
    case 'Phone Number':
      return 'phone';
    case 'Bank Account / IBAN':
      return 'iban';
    case 'Payment Cards':
      return 'card';
    case 'Confidentiality Labels':
      return 'confidential';
    case 'Password/API Key':
      return 'password';
    case 'API Keys & Secrets':
    default:
      return 'api_key';
  }
}

export const RULE_PRIORITIES: Record<string, number> = {
  private_key: 120,
  rule_private_keys: 110,
  sk_key: 105,
  stripe: 105,
  aws: 105,
  google: 105,
  github: 105,
  github_pat: 105,
  slack: 105,
  huggingface: 105,
  google_oauth: 105,
  sendgrid: 105,
  jwt: 105,
  bearer: 105,
  uri_cred: 105,
  rule_api_keys: 100,
  rule_database_uri: 95,
  id_ctx_strong: 92,
  id_ctx_acct: 92,
  id_ctx_generic: 92,
  id_ctx_rev_strong: 92,
  id_ctx_rev_acct: 92,
  id_ctx_rev_generic: 92,
  card: 90,
  rule_payment_card: 90,
  acct: 88,
  cnic: 85,
  ssn: 85,
  iban: 85,
  rule_national_id_cnic: 85,
  rule_iban: 80,
  phone_pk: 75,
  phone_intl: 75,
  rule_phone_pk: 75,
  cred_forward: 70,
  cred_direct: 70,
  cred_reverse: 70,
  cred_env: 70,
  cred_list: 70,
  rule_cvv_otp_pin: 70,
  rule_email_list: 65,
  phone_ctx: 50,
  rule_keyword_proximity: 60,
  email: 45,
  dob_ctx: 40,
  rule_password_assignments: 50,
  rule_source_config_markers: 40,
  conf_label: 30,
  rule_confidentiality_labels: 30,
  rule_custom_id: 25,
  rule_high_entropy_secret: 10,
};

export function getMatchPriority(m: ScanMatchOffset): number {
  if (
    m.rule_id === 'rule_private_keys' ||
    m.rule_id === 'private_key' ||
    m.explanation.toLowerCase().includes('private key') ||
    m.explanation.toLowerCase().includes('cryptographic key')
  ) {
    return 120;
  }
  return RULE_PRIORITIES[m.rule_id] || 0;
}

/**
 * Merge overlapping matches, keeping the highest priority rule
 * and recording other overlapping rule_ids in alsoMatchedRuleIds.
 * Ensures: private key > known-format API key > credential phrase/keyword proximity > password assignment > source/env marker > possible secret
 */
export function resolveOverlappingMatches(rawMatches: ScanMatchOffset[]): ScanMatchOffset[] {
  if (rawMatches.length <= 1) return rawMatches;

  // Sort by start offset ascending, then length descending
  const sorted = [...rawMatches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  // Group into overlapping clusters
  const clusters: ScanMatchOffset[][] = [];
  let currentCluster: ScanMatchOffset[] = [];
  let clusterEnd = -1;

  for (const m of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(m);
      clusterEnd = m.end;
    } else {
      // If m overlaps the current cluster span
      if (m.start < clusterEnd) {
        currentCluster.push(m);
        clusterEnd = Math.max(clusterEnd, m.end);
      } else {
        clusters.push(currentCluster);
        currentCluster = [m];
        clusterEnd = m.end;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  // From each cluster, pick the single highest priority match
  const merged: ScanMatchOffset[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      merged.push({ ...cluster[0] });
      continue;
    }

    // Sort cluster members by priority descending, then severity descending
    cluster.sort((a, b) => {
      const prioA = getMatchPriority(a);
      const prioB = getMatchPriority(b);
      if (prioA !== prioB) return prioB - prioA;
      const sevA = SEVERITY_WEIGHTS[a.severity] || 0;
      const sevB = SEVERITY_WEIGHTS[b.severity] || 0;
      if (sevA !== sevB) return sevB - sevA;
      return (b.end - b.start) - (a.end - a.start);
    });

    const winner = cluster[0];
    const alsoMatched = new Set<string>();
    for (let i = 1; i < cluster.length; i++) {
      if (cluster[i].rule_id !== winner.rule_id) {
        alsoMatched.add(cluster[i].rule_id);
      }
      if (cluster[i].alsoMatchedRuleIds) {
        for (const rid of cluster[i].alsoMatchedRuleIds!) {
          if (rid !== winner.rule_id) {
            alsoMatched.add(rid);
          }
        }
      }
    }

    merged.push({
      ...winner,
      alsoMatchedRuleIds: Array.from(alsoMatched),
    });
  }

  return merged.sort((a, b) => a.start - b.start);
}

/**
 * Scan a text payload against active policies, keyword proximity, and scanner rules.
 * Strictly enforces Privacy Invariants: No matched secret values are returned or preserved.
 */
export async function scanTextAsync(
  text: string,
  rules: ScannerRuleConfig[],
  customIdRegex?: string,
  extraKeywordsArg?: string[],
  options?: {
    credentialKeywords?: string[];
    hinglishWords?: string[];
    placeholders?: string[];
  }
): Promise<ScanResult> {
  const startTime = performance.now();
  const disclaimer = 'No configured patterns matched. This does not mean the text is safe.';

  if (!text || text.trim().length === 0) {
    return {
      scan_status: 'Completed',
      totalMatches: 0,
      categories: [],
      categoryCounts: {},
      highestSeverity: 'None',
      matches: [],
      ruleMatches: {},
      durationMs: 0,
      disclaimer,
    };
  }

  // 1. Extra credential keywords from argument or persistent settings
  let extraKeywords = extraKeywordsArg;
  if (!extraKeywords || extraKeywords.length === 0) {
    try {
      const stored = settingsRepo.get('extra_credential_keywords', '');
      extraKeywords = stored ? JSON.parse(stored) : [];
    } catch {
      extraKeywords = [];
    }
  }

  // 2. PRIMARY DETECTOR: detectAll from contextDetector
  const primaryMatches: ScanMatchOffset[] = [];
  const failedRuleIds: string[] = [];
  let detectAllFailed = false;

  try {
    const hits = detectAll(text, extraKeywords);
    for (const hit of hits) {
      primaryMatches.push({
        rule_id: hit.rule,
        category: hit.category,
        severity: hit.severity as SeverityLevel,
        start: hit.start,
        end: hit.end,
        explanation: getExplanationForHit(hit.category, hit.rule),
        falsePositiveNote: 'Sanitized tokens, documentation examples, or test identifiers.',
        placeholderType: getPlaceholderTypeForCategory(hit.category),
      });
    }
  } catch (detectErr: any) {
    console.warn('detectAll primary detector failed:', detectErr);
    detectAllFailed = true;
    const failedName = detectErr?.message || 'context_detector';
    failedRuleIds.push(failedName);
  }

  // Load configured dictionaries or fall back to defaults for fallback rules
  let credentialKeywords = options?.credentialKeywords;
  let hinglishWords = options?.hinglishWords;
  let placeholders = options?.placeholders;

  try {
    if (!credentialKeywords) {
      const stored = settingsRepo.get('credential_keywords', '');
      credentialKeywords = stored ? JSON.parse(stored) : DEFAULT_CREDENTIAL_KEYWORDS;
    }
    if (!hinglishWords) {
      const stored = settingsRepo.get('hinglish_keywords', '');
      hinglishWords = stored ? JSON.parse(stored) : DEFAULT_HINGLISH_WORDS;
    }
    if (!placeholders) {
      const stored = settingsRepo.get('known_placeholders', '');
      placeholders = stored ? JSON.parse(stored) : DEFAULT_PLACEHOLDERS;
    }
  } catch {
    credentialKeywords = DEFAULT_CREDENTIAL_KEYWORDS;
    hinglishWords = DEFAULT_HINGLISH_WORDS;
    placeholders = DEFAULT_PLACEHOLDERS;
  }

  // Normalize input text for robust scanning while mapping offsets to original text
  const { normalized, mapToOriginal } = normalizeInputText(text);

  // Fallback matches from configured regex rules
  const rawMatches: ScanMatchOffset[] = [];

  try {
    // A. Process custom ID regex if defined
    if (customIdRegex && customIdRegex.trim().length > 0) {
      try {
        const customIdRe = new RegExp(customIdRegex, 'g');
        let m: RegExpExecArray | null;
        while ((m = customIdRe.exec(normalized)) !== null) {
          if (m[0].length === 0) break;
          const orig = mapToOriginal(m.index, m.index + m[0].length);
          rawMatches.push({
            rule_id: 'rule_custom_id',
            category: 'National ID',
            severity: 'High',
            start: orig.start,
            end: orig.end,
            explanation: 'Detected organization-defined custom National ID pattern.',
            falsePositiveNote: 'May match internal serial numbers or codes.',
            placeholderType: 'cnic',
          });
        }
      } catch (e) {
        console.warn('Failed executing customIdRegex:', e);
        failedRuleIds.push('rule_custom_id');
      }
    }

    // 2. Process all configured policy rules
    for (const rule of rules) {
      if (!rule.enabled) continue;

      try {
        if (rule.rule_id === 'rule_payment_card') {
          // Card regex candidate detection + Luhn filter
          const cardRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = cardRe.exec(normalized)) !== null) {
            const candidateStr = m[0];
            const digitsOnly = candidateStr.replace(/\D/g, '');
            if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && isValidLuhn(digitsOnly)) {
              const orig = mapToOriginal(m.index, m.index + candidateStr.length);
              rawMatches.push({
                rule_id: rule.rule_id,
                category: rule.category,
                severity: rule.severity,
                start: orig.start,
                end: orig.end,
                explanation: rule.explanation,
                falsePositiveNote: rule.falsePositiveNote,
                placeholderType: 'card',
              });
            }
          }
        } else if (rule.rule_id === 'rule_database_uri') {
          const dbRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = dbRe.exec(normalized)) !== null) {
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'api_key',
            });
          }
        } else if (rule.rule_id === 'rule_national_id_cnic') {
          const cnicRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = cnicRe.exec(normalized)) !== null) {
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'cnic',
            });
          }
        } else if (rule.rule_id === 'rule_iban') {
          const ibanRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = ibanRe.exec(normalized)) !== null) {
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'iban',
            });
          }
        } else if (rule.rule_id === 'rule_phone_pk') {
          const phoneRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = phoneRe.exec(normalized)) !== null) {
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'phone',
            });
          }
        } else if (rule.rule_id === 'rule_cvv_otp_pin') {
          const cvvRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = cvvRe.exec(normalized)) !== null) {
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'card',
            });
          }
        } else if (rule.rule_id === 'rule_email_list') {
          const emailRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          const emailOffsets: { start: number; end: number }[] = [];
          while ((m = emailRe.exec(normalized)) !== null) {
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            emailOffsets.push({ start: orig.start, end: orig.end });
          }

          const effectiveSeverity: SeverityLevel = emailOffsets.length >= 3 ? 'High' : 'Medium';
          for (const off of emailOffsets) {
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: effectiveSeverity,
              start: off.start,
              end: off.end,
              explanation:
                emailOffsets.length >= 3
                  ? 'Bulk email address list detected (3+ addresses), elevating exposure risk.'
                  : rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'email',
            });
          }
        } else if (rule.rule_id === 'rule_password_assignments') {
          const pwdRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = pwdRe.exec(normalized)) !== null) {
            const rawMatch = m[0];
            const capturedValue = m[1] || '';

            if (capturedValue.length >= 4 && !isPlaceholder(capturedValue, placeholders)) {
              const splitIdx = rawMatch.indexOf(capturedValue);
              const prefix = splitIdx > 0 ? rawMatch.slice(0, splitIdx) : 'password=';
              const orig = mapToOriginal(m.index, m.index + rawMatch.length);

              rawMatches.push({
                rule_id: rule.rule_id,
                category: rule.category,
                severity: rule.severity,
                start: orig.start,
                end: orig.end,
                explanation: rule.explanation,
                falsePositiveNote: rule.falsePositiveNote,
                placeholderType: 'password',
                keyPrefix: prefix,
              });
            }
          }
        } else if (rule.rule_id === 'rule_source_config_markers') {
          // Only UPPER_CASE env names, value 8+ chars, NOT a placeholder
          const envRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = envRe.exec(normalized)) !== null) {
            const fullMatch = m[0];
            const val = (m[1] || '').trim();
            if (val.length >= 8 && !isPlaceholder(val, placeholders)) {
              const splitIdx = fullMatch.indexOf(val);
              const prefix = splitIdx > 0 ? fullMatch.slice(0, splitIdx) : '';
              const orig = mapToOriginal(m.index, m.index + fullMatch.length);
              rawMatches.push({
                rule_id: rule.rule_id,
                category: rule.category,
                severity: rule.severity,
                start: orig.start,
                end: orig.end,
                explanation: rule.explanation,
                falsePositiveNote: rule.falsePositiveNote,
                placeholderType: 'api_key',
                keyPrefix: prefix,
              });
            }
          }
        } else if (rule.rule_id === 'rule_high_entropy_secret') {
          // Generic high-entropy: standalone token of 24+ chars with entropy > 3.5 anywhere
          const entropyRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = entropyRe.exec(normalized)) !== null) {
            const candidate = m[0];
            if (candidate.length < 24) continue;
            if (!/[a-zA-Z]/.test(candidate) || !/\d/.test(candidate)) continue;
            if (isPlaceholder(candidate, placeholders)) continue;

            const entropy = calculateShannonEntropy(candidate);
            if (entropy <= 3.5) continue;

            const orig = mapToOriginal(m.index, m.index + candidate.length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category, // 'possible secret'
              severity: rule.severity, // 'Medium'
              start: orig.start,
              end: orig.end,
              explanation: `${rule.explanation} (Shannon entropy: ${entropy.toFixed(2)})`,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'possible_secret',
            });
          }
        } else if (rule.rule_id === 'rule_api_keys') {
          // Known format tokens anywhere
          const apiRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          while ((m = apiRe.exec(normalized)) !== null) {
            const candidate = m[0];
            if (isPlaceholder(candidate, placeholders)) continue;
            const orig = mapToOriginal(m.index, m.index + candidate.length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType: 'api_key',
            });
          }
        } else if (rule.rule_id === 'rule_keyword_proximity') {
          // Handled comprehensively in Layer 3 below using bidirectional proximity
        } else {
          // Generic custom rule
          const genericRe = compileRuleRegex(rule);
          let m: RegExpExecArray | null;
          let placeholderType: PlaceholderKind = 'custom';
          if (rule.category.includes('API') || rule.category.includes('Secret')) {
            placeholderType = 'api_key';
          } else if (rule.category.includes('Confidential')) {
            placeholderType = 'confidential';
          }

          while ((m = genericRe.exec(normalized)) !== null) {
            if (m[0].length === 0) break;
            if (isPlaceholder(m[0], placeholders)) continue;
            const orig = mapToOriginal(m.index, m.index + m[0].length);
            rawMatches.push({
              rule_id: rule.rule_id,
              category: rule.category,
              severity: rule.severity,
              start: orig.start,
              end: orig.end,
              explanation: rule.explanation,
              falsePositiveNote: rule.falsePositiveNote,
              placeholderType,
            });
          }
        }
      } catch (ruleErr) {
        console.warn(`Error running rule ${rule.rule_id}:`, ruleErr);
        failedRuleIds.push(rule.rule_id);
      }
    }

    // 3. Layer 3: Bidirectional Keyword Proximity (credential & Hinglish context)
    // Find candidate values within 60 chars before or after credential keywords on the same line or sentence
    try {
      const allKeywords = Array.from(new Set([...(credentialKeywords || []), ...(hinglishWords || [])]))
        .filter(k => k.trim().length > 0)
        .sort((a, b) => b.length - a.length);

      const getSameLineSentenceBefore = (fullText: string, tStart: number, maxChars = 60): string => {
        const minIdx = Math.max(0, tStart - maxChars);
        let chunk = fullText.slice(minIdx, tStart);
        const lastNl = Math.max(chunk.lastIndexOf('\n'), chunk.lastIndexOf('\r'));
        if (lastNl !== -1) {
          chunk = chunk.slice(lastNl + 1);
        }
        const sentBoundary = chunk.search(/[.!?]\s+[^\s]/);
        if (sentBoundary !== -1) {
          const afterBoundary = chunk.slice(sentBoundary).search(/\s+[^\s]/);
          if (afterBoundary !== -1) {
            chunk = chunk.slice(sentBoundary + afterBoundary + 1);
          }
        }
        return chunk;
      };

      const getSameLineSentenceAfter = (fullText: string, tEnd: number, maxChars = 60): string => {
        const maxIdx = Math.min(fullText.length, tEnd + maxChars);
        let chunk = fullText.slice(tEnd, maxIdx);
        const firstNl = chunk.search(/[\r\n]/);
        if (firstNl !== -1) {
          chunk = chunk.slice(0, firstNl);
        }
        const sentBoundary = chunk.search(/[.!?](?:\s|$)/);
        if (sentBoundary !== -1) {
          chunk = chunk.slice(0, sentBoundary + 1);
        }
        return chunk;
      };

      // Strong credential phrase regexes (case-insensitive)
      const STRONG_BEFORE_REGEX = /(?:(?:my|mera|meri)\s+)?(?:api\s*key|password|passcode|pass|pwd|token|secret|pin|otp|cvv|key)(?:\s+(?:ye\s+)?(?:hai|raha|is)|[\s:=]+)\s*["'`]?$/i;
      const STRONG_AFTER_REGEX = /^["'`]?\s*(?:(?:is\s+(?:my\s+|the\s+)?(?:api\s*key|key|password|passcode|pass|pwd|token|secret|pin|otp|cvv))|(?:<[-=]|<=|=)\s*(?:password|pass|pwd|api\s*key|key|token|secret|pin|otp|cvv)|(?:(?:mera\s+|meri\s+)?(?:password|pass|pwd|api\s*key|key|token|secret|pin|otp|cvv)\s+hai))/i;

      const COMMON_REJECT_WORDS = new Set([
        'password',
        'username',
        'hello',
        'thanks',
        'please',
        'nothing',
        'example',
        'sample',
        'without',
        'within',
        'before',
        'after',
        'sentence',
      ]);

      // Token pattern: non-whitespace sequence of 6+ chars
      const tokenRe = /[^\s"'`]{6,}/g;
      let tokMatch: RegExpExecArray | null;

      while ((tokMatch = tokenRe.exec(text)) !== null) {
        const rawToken = tokMatch[0];
        let candidateVal = rawToken;
        let candidateStart = tokMatch.index;
        let inlineKeyword: string | null = null;

        // Check for attached keyword prefix e.g. KEY:X, password=X, token:X
        const prefixMatch = rawToken.match(/^([a-zA-Z0-9_]{2,})[:=](.+)$/);
        if (prefixMatch) {
          const potentialKw = prefixMatch[1].toLowerCase();
          if (allKeywords.some(k => k.toLowerCase() === potentialKw || potentialKw.includes(k.toLowerCase()))) {
            inlineKeyword = prefixMatch[1];
            candidateVal = prefixMatch[2];
            candidateStart = tokMatch.index + prefixMatch[1].length + 1;
          }
        }

        // Strip outer quotes, brackets, parens, trailing punctuation
        const leadingTrimMatch = candidateVal.match(/^[("'`<\[]+/);
        const leadingTrim = leadingTrimMatch ? leadingTrimMatch[0].length : 0;
        const cleanToken = candidateVal.replace(/^[("'`<\[]+|[)"'`>\].,;:!?]+$/g, '').trim();
        if (cleanToken.length < 6) continue;

        // Exact placeholder check
        if (isPlaceholder(cleanToken, placeholders)) continue;

        const tokenStart = candidateStart + leadingTrim;
        const tokenEnd = tokenStart + cleanToken.length;

        // Window of up to 60 chars before and after on the same sentence/line
        const windowBefore = getSameLineSentenceBefore(text, tokenStart, 60);
        const windowAfter = getSameLineSentenceAfter(text, tokenEnd, 60);

        // Check for strong credential context
        const strongBefore = inlineKeyword !== null || STRONG_BEFORE_REGEX.test(windowBefore);
        const strongAfter = STRONG_AFTER_REGEX.test(windowAfter);
        const isStrongContext = strongBefore || strongAfter;

        let foundKeyword: string | null = inlineKeyword;
        let isBefore = true;

        if (isStrongContext) {
          // Under strong context: accept any token of 6+ characters (digits only is fine)
          // UNLESS it is a placeholder or a common word (password, username, hello, thanks, please)
          if (COMMON_REJECT_WORDS.has(cleanToken.toLowerCase())) {
            continue;
          }
          foundKeyword = inlineKeyword || (strongBefore ? 'strong-credential' : 'strong-credential-following');
          isBefore = strongBefore;
        } else {
          // Weak proximity: candidate value requirement applies (letter AND digit, or mixed case + symbol, or 20+ chars entropy > 3.5)
          if (!isCandidateValue(cleanToken, placeholders)) {
            continue;
          }

          for (const kw of allKeywords) {
            const kwRegex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
            if (kwRegex.test(windowBefore)) {
              foundKeyword = kw;
              isBefore = true;
              break;
            }
            if (kwRegex.test(windowAfter)) {
              foundKeyword = kw;
              isBefore = false;
              break;
            }
          }
        }

        if (foundKeyword) {
          const combinedContext = (
            (inlineKeyword ? `${inlineKeyword} ` : '') +
            windowBefore + ' ' + windowAfter
          ).toLowerCase();

          const isPassword =
            combinedContext.includes('password') ||
            combinedContext.includes('passcode') ||
            combinedContext.includes('pass') ||
            combinedContext.includes('pwd');

          const isPinOrOtp =
            combinedContext.includes('pin') ||
            combinedContext.includes('otp') ||
            combinedContext.includes('cvv');

          let category = 'API Keys & Secrets';
          let placeholderType: PlaceholderKind = 'api_key';
          let severity: SeverityLevel = 'Critical';

          if (isPinOrOtp) {
            category = 'CVV, OTP & PIN';
            placeholderType = 'possible_secret';
            severity = 'High';
          } else if (isPassword) {
            category = 'Password Assignments';
            placeholderType = 'password';
            severity = 'High';
          }

          rawMatches.push({
            rule_id: 'rule_keyword_proximity',
            category,
            severity,
            start: tokenStart,
            end: tokenEnd,
            explanation: isStrongContext
              ? `Detected sensitive credential value in strong phrase context (${isBefore ? 'preceding' : 'following'}).`
              : `Detected credential value associated with keyword "${foundKeyword}" (${isBefore ? 'preceding' : 'following'}).`,
            falsePositiveNote: 'Documentation examples, sanitized tokens, or test identifiers.',
            placeholderType,
            keyPrefix: inlineKeyword ? `${inlineKeyword}=` : undefined,
          });
        }
      }
    } catch (proxErr) {
      console.warn('Keyword proximity scan error:', proxErr);
      failedRuleIds.push('rule_keyword_proximity');
    }

    // Keep the old rules only as a fallback: if an old rule and detectAll report overlapping spans,
    // keep the detectAll hit and drop the old one.
    const nonOverlappingFallbackMatches: ScanMatchOffset[] = [];
    for (const fb of rawMatches) {
      const overlapsPrimary = primaryMatches.some(
        (pm) => fb.start < pm.end && fb.end > pm.start
      );
      if (!overlapsPrimary) {
        nonOverlappingFallbackMatches.push(fb);
      }
    }

    const allMatches = [...primaryMatches, ...nonOverlappingFallbackMatches];
    const resolvedMatches = resolveOverlappingMatches(allMatches);

    // Compute category counts and rule match counts
    const categoryCounts: Record<string, number> = {};
    const ruleMatches: Record<string, number> = {};

    let highestSeverity: SeverityLevel | 'None' = 'None';
    let maxWeight = 0;

    for (const m of resolvedMatches) {
      categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
      ruleMatches[m.rule_id] = (ruleMatches[m.rule_id] || 0) + 1;

      const w = SEVERITY_WEIGHTS[m.severity];
      if (w > maxWeight) {
        maxWeight = w;
        highestSeverity = m.severity;
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    const scan_status = failedRuleIds.length > 0 || detectAllFailed ? 'Partial' : 'Completed';
    const failureMessage =
      failedRuleIds.length === 1
        ? `Partial scan: rule ${failedRuleIds[0]} failed`
        : failedRuleIds.length > 1
        ? `Partial scan: rules ${failedRuleIds.join(', ')} failed`
        : undefined;

    const resultDisclaimer =
      resolvedMatches.length > 0
        ? 'Review findings carefully. Automated pattern detection can produce false positives or miss unknown patterns.'
        : 'No configured patterns matched. This does not mean the text is safe.';

    return {
      scan_status,
      totalMatches: resolvedMatches.length,
      categories: Object.keys(categoryCounts),
      categoryCounts,
      highestSeverity,
      matches: resolvedMatches,
      ruleMatches,
      durationMs,
      disclaimer: resultDisclaimer,
      failedRuleIds: failedRuleIds.length > 0 ? failedRuleIds : undefined,
      failureMessage,
    };
  } catch (err) {
    console.error('Scan failed:', err);
    return {
      scan_status: 'Failed',
      totalMatches: 0,
      categories: [],
      categoryCounts: {},
      highestSeverity: 'None',
      matches: [],
      ruleMatches: {},
      durationMs: Math.round(performance.now() - startTime),
      disclaimer: 'Scan execution failed unexpectedly. Text should NOT be considered safe.',
    };
  }
}
