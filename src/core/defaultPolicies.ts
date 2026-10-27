/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ScannerRuleConfig {
  rule_id: string;
  category: string;
  regex: string;
  flags?: string; // Regex flags e.g. "g", "gi", "gim"
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  enabled: boolean;
  explanation: string;
  falsePositiveNote: string;
}

export interface PolicyTemplate {
  name: string;
  description: string;
  toolApprovalPolicy: {
    defaultStatus: 'Unreviewed' | 'Restricted';
    allowedDomains: string[];
    restrictedDomains: string[];
  };
  dataCategories: ScannerRuleConfig[];
  alertThresholds: {
    minSeverityForAlert: 'Low' | 'Medium' | 'High' | 'Critical';
    minRiskScoreForAlert: number;
    autoEscalateCritical: boolean;
  };
  retention: {
    eventRetentionDays: number;
    findingRetentionDays: number;
    auditLogRetentionDays: number;
    reportRetentionDays: number;
  };
}

export const DEFAULT_CREDENTIAL_KEYWORDS: string[] = [
  'api key',
  'apikey',
  'api_key',
  'key',
  'token',
  'secret',
  'password',
  'passcode',
  'pass',
  'pwd',
  'pin',
  'otp',
  'cvv',
  'cvc',
  'auth',
  'credentials',
  'login',
];

export const DEFAULT_HINGLISH_WORDS: string[] = [
  'meri',
  'mera',
  'mere',
  'ye',
  'yeh',
  'hai',
  'raha',
  'hoga',
  'wala',
  'wali',
  'bhejo',
  'de',
  'lo',
];

export const DEFAULT_PLACEHOLDERS: string[] = [
  'changeme',
  'your_api_key',
  'your_password',
  'your_secret',
  'your_token',
  'xxxx',
  'example',
  'test123',
  '<api_key>',
  '<your_api_key>',
  'placeholder',
  'null',
  'undefined',
];

export const RULES_VERSION = 4;

export const DEFAULT_SCANNER_RULES: ScannerRuleConfig[] = [
  {
    rule_id: 'rule_api_keys',
    category: 'API Keys & Secrets',
    // Known key patterns: OpenAI sk-, Stripe sk_live_/pk_live_, AWS AKIA, Google AIza, GitHub ghp/gho/github_pat, Slack xox, JWT, Bearer tokens, PEM headers
    regex: '\\b(?:sk-[a-zA-Z0-9_\\-]{8,}|sk_live_[a-zA-Z0-9]{20,}|pk_live_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_\\-]{35}|(?:ghp|gho|github_pat)_[a-zA-Z0-9_]{36,}|xox[baprs]-[0-9a-zA-Z\\-]{10,}|eyJ[a-zA-Z0-9_\\-]{10,}\\.eyJ[a-zA-Z0-9_\\-]{10,}\\.[a-zA-Z0-9_\\-]{10,}|Bearer\\s+[a-zA-Z0-9_\\-\\.\\%]{20,})\\b|-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
    flags: 'g',
    severity: 'Critical',
    enabled: true,
    explanation: 'Detected known-format production API key, cloud access token, JWT, or private cryptographic key.',
    falsePositiveNote: 'Sanitized dummy keys or tutorial tokens inside documentation.',
  },
  {
    rule_id: 'rule_database_uri',
    category: 'API Keys & Secrets',
    // Database connection strings containing embedded credentials
    regex: '\\b(?:mongodb(?:\\+srv)?|postgres(?:ql)?|mysql|redis):\\/\\/[a-zA-Z0-9_\\-\\.\\%]+:[a-zA-Z0-9_\\-\\.\\%]+@[^\\s"\'`]+\\b',
    flags: 'g',
    severity: 'Critical',
    enabled: true,
    explanation: 'Detected database connection URI with embedded authentication credentials.',
    falsePositiveNote: 'Local test connection strings with dummy passwords.',
  },
  {
    rule_id: 'rule_payment_card',
    category: 'Payment Cards',
    // 13 to 19 digits with optional spaces, dashes, or dots; must pass Luhn check
    regex: '\\b(?:\\d[\\s\\-\\.]?){13,19}\\b',
    flags: 'g',
    severity: 'Critical',
    enabled: true,
    explanation: 'Detected payment card primary account number (PAN) passing Luhn checksum.',
    falsePositiveNote: 'Random numbers formatted like cards may coincidentally pass the Luhn algorithm.',
  },
  {
    rule_id: 'rule_national_id_cnic',
    category: 'National ID',
    // Matches Pakistani CNIC format: 35202-1234567-1, 3520212345671, or "35202 1234567 1"
    regex: '\\b\\d{5}[-\\s]?\\d{7}[-\\s]?\\d\\b',
    flags: 'g',
    severity: 'High',
    enabled: true,
    explanation: 'Detected Pakistani National Identity Card (CNIC) number format.',
    falsePositiveNote: '13-digit numbers could represent barcode SKUs or invoice tracking numbers.',
  },
  {
    rule_id: 'rule_iban',
    category: 'Banking & Financial',
    // Pakistani IBAN (PK + 22 alphanumerics = 24 chars) with optional spacing
    regex: '\\bPK\\d{2}(?:[\\s]?[A-Z0-9]{4}){5}\\b|\\bPK\\d{2}[A-Za-z0-9]{20}\\b',
    flags: 'gi',
    severity: 'High',
    enabled: true,
    explanation: 'Detected International Bank Account Number (IBAN).',
    falsePositiveNote: 'Sample account numbers from banking documentation or tests.',
  },
  {
    rule_id: 'rule_phone_pk',
    category: 'Phone Numbers',
    // Pakistani phone numbers with and without separators (0300-1234567, 03001234567, +92 300 1234567, 0092...)
    regex: '(?:\\+92|\\b0092|\\b0)[-\\s]?(?:3\\d{2})[-\\s]?\\d{7}\\b',
    flags: 'g',
    severity: 'Medium',
    enabled: true,
    explanation: 'Detected Pakistani mobile phone number format.',
    falsePositiveNote: 'Public business contact numbers or directory listings.',
  },
  {
    rule_id: 'rule_cvv_otp_pin',
    category: 'Payment Cards',
    // CVV / OTP / PIN only when immediately next to those keywords
    regex: '\\b(?:cvv|cvc|otp|pin|passcode)\\s*[:=]?\\s*\\d{3,6}\\b|\\b\\d{3,6}\\s*(?:is\\s+my\\s+)?(?:cvv|cvc|otp|pin|passcode)\\b',
    flags: 'gi',
    severity: 'High',
    enabled: true,
    explanation: 'Detected card security code (CVV/CVC) or one-time verification passcode (OTP/PIN).',
    falsePositiveNote: 'Postal codes or port numbers positioned near security keywords.',
  },
  {
    rule_id: 'rule_email_list',
    category: 'Email Lists',
    // Email regex
    regex: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
    flags: 'gi',
    severity: 'Medium', // Escalates to High if 3+ emails found in scan
    enabled: true,
    explanation: 'Detected corporate or personal email addresses in prompt payload.',
    falsePositiveNote: 'Public contact emails, support addresses, or documentation examples.',
  },
  {
    rule_id: 'rule_keyword_proximity',
    category: 'Password/API Key',
    // Layered bidirectional proximity matching with credential and Hinglish keywords
    regex: '\\b(?:my\\s+api\\s+key\\s+is|api\\s+key\\s*[:=]|api\\s+key\\s+is|the\\s+password\\s+is|my\\s+token\\s+is|secret\\s+key\\s+is|pass\\s+is|pwd\\s+is|meri\\s+api\\s+key\\s+ye\\s+hai|password\\s+hai|mera\\s+password\\s+hai|pass\\s+ye\\s+hai|token\\s+ye\\s+raha)\\s*(?:["\'`]([^"\'`\\r\\n]{6,})["\'`]|([^"\'`\\s\\r\\n]{6,}))',
    flags: 'gi',
    severity: 'High',
    enabled: true,
    explanation: 'Detected conversational or proximity-based credential disclosure.',
    falsePositiveNote: 'Documentation examples or placeholder values (e.g. changeme, your_api_key).',
  },
  {
    rule_id: 'rule_password_assignments',
    category: 'Password Assignments',
    // password = value, passwd = value, secret = value
    regex: '(?:password|passwd|pwd|secret|api_key|apikey)\\s*[:=]\\s*["\']?([^"\'\\s\\r\\n]{4,})["\']?',
    flags: 'gi',
    severity: 'High',
    enabled: true,
    explanation: 'Detected explicit password or authentication secret key-value assignment.',
    falsePositiveNote: 'Placeholder values like "changeme", "your_password", or template variables.',
  },
  {
    rule_id: 'rule_source_config_markers',
    category: 'Source Code & Config Markers',
    // Only UPPER_CASE environment variable assignments of 8+ characters, without "i" flag
    regex: '(?:^|\\b)[A-Z][A-Z0-9_]{2,}\\s*=\\s*["\']?([^"\'\\s\\r\\n]{8,})["\']?',
    flags: 'gm',
    severity: 'High',
    enabled: true,
    explanation: 'Detected uppercase environment configuration secret assignment.',
    falsePositiveNote: 'Non-sensitive uppercase configuration variables like NODE_ENV or LOG_LEVEL.',
  },
  {
    rule_id: 'rule_confidentiality_labels',
    category: 'Confidentiality Labels',
    // Explicit classification headers
    regex: '\\b(?:CONFIDENTIAL(?:\\s*:\\s*\\w+)?|STRICTLY CONFIDENTIAL|INTERNAL ONLY|INTERNAL USE ONLY|PROPRIETARY & CONFIDENTIAL|RESTRICTED DISCLOSURE)\\b',
    flags: 'gi',
    severity: 'High',
    enabled: true,
    explanation: 'Detected explicit institutional confidentiality or internal-use restriction marking.',
    falsePositiveNote: 'Standard non-disclosure boilerplate in open-source license files.',
  },
  {
    rule_id: 'rule_high_entropy_secret',
    category: 'possible secret',
    // Standalone string of 24+ chars evaluated with Shannon entropy filter > 3.5 anywhere
    regex: '\\b[a-zA-Z0-9_\\-]{24,}\\b',
    flags: 'g',
    severity: 'Medium',
    enabled: true,
    explanation: 'Standalone high-entropy string detected (Shannon entropy > 3.5).',
    falsePositiveNote: 'High-entropy strings may be non-sensitive hashes, UUIDs, or random identifiers.',
  },
];

export const BALANCED_TEMPLATE: PolicyTemplate = {
  name: 'Balanced (Standard Enterprise)',
  description: 'Recommended for general business environments. Monitors unreviewed AI tools with standard DLP warnings.',
  toolApprovalPolicy: {
    defaultStatus: 'Unreviewed',
    allowedDomains: ['copilot.microsoft.com'],
    restrictedDomains: ['deepseek.com'],
  },
  dataCategories: DEFAULT_SCANNER_RULES,
  alertThresholds: {
    minSeverityForAlert: 'High',
    minRiskScoreForAlert: 50,
    autoEscalateCritical: true,
  },
  retention: {
    eventRetentionDays: 90,
    findingRetentionDays: 180,
    auditLogRetentionDays: 365,
    reportRetentionDays: 365,
  },
};

export const STRICT_TEMPLATE: PolicyTemplate = {
  name: 'Strict (Regulated & Defense)',
  description: 'Aggressive data protection. Alerts on all unreviewed tools and Medium+ findings.',
  toolApprovalPolicy: {
    defaultStatus: 'Restricted',
    allowedDomains: [],
    restrictedDomains: ['chatgpt.com', 'openai.com', 'claude.ai', 'deepseek.com', 'perplexity.ai'],
  },
  dataCategories: DEFAULT_SCANNER_RULES.map(r => ({
    ...r,
    severity: r.severity === 'Low' ? 'Medium' : r.severity,
  })),
  alertThresholds: {
    minSeverityForAlert: 'Medium',
    minRiskScoreForAlert: 30,
    autoEscalateCritical: true,
  },
  retention: {
    eventRetentionDays: 180,
    findingRetentionDays: 365,
    auditLogRetentionDays: 730,
    reportRetentionDays: 730,
  },
};

export const EDUCATION_TEMPLATE: PolicyTemplate = {
  name: 'Education & Research',
  description: 'Permissive baseline with warnings for high-risk financial and cryptographic secrets.',
  toolApprovalPolicy: {
    defaultStatus: 'Unreviewed',
    allowedDomains: ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai', 'huggingface.co'],
    restrictedDomains: [],
  },
  dataCategories: DEFAULT_SCANNER_RULES,
  alertThresholds: {
    minSeverityForAlert: 'Critical',
    minRiskScoreForAlert: 75,
    autoEscalateCritical: false,
  },
  retention: {
    eventRetentionDays: 30,
    findingRetentionDays: 90,
    auditLogRetentionDays: 180,
    reportRetentionDays: 180,
  },
};
