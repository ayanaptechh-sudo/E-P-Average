/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScanMatchOffset, PlaceholderKind } from '../scanner/scannerEngine';
import { SeverityLevel } from '../database/types';

export interface RedactionSpan {
  start: number;
  end: number;
  replacement: string;
  category: string;
  severity: SeverityLevel;
}

export interface HighlightSpan {
  start: number;
  end: number;
  severity: SeverityLevel;
  category: string;
}

export interface RedactionResult {
  redactedText: string;
  redactionCount: number;
  categories: string[];
  originalHighlights: HighlightSpan[];
  redactedHighlights: HighlightSpan[];
  disclaimer: string;
}

function getPlaceholder(
  text: string,
  spanStart: number,
  category: string,
  kind?: PlaceholderKind,
  keyPrefix?: string
): string {
  if (keyPrefix) {
    return `${keyPrefix}[SECRET REDACTED]`;
  }

  // Exact replacement text by category:
  switch (category) {
    case 'Password/API Key':
    case 'API Keys & Secrets':
    case 'Password Assignments':
      return '[SECRET REDACTED]';
    case 'National ID':
      return 'ID: XXXXX-XXXXXXX-X';
    case 'Personal ID':
      return '[ID REDACTED]';
    case 'Phone Number':
      return '[PHONE REDACTED]';
    case 'Bank Account / IBAN':
      return '[ACCOUNT REDACTED]';
    case 'Payment Cards':
      return '[CARD NUMBER REDACTED]';
    case 'Email Lists':
      return '[EMAIL REDACTED]';
    case 'Passport':
      return '[PASSPORT REDACTED]';
    case 'SSN':
      return '[SSN REDACTED]';
    case 'Date of Birth':
      return '[DOB REDACTED]';
    case 'Confidentiality Labels':
      return '[CONFIDENTIAL CONTENT REMOVED]';
    default:
      break;
  }

  switch (kind) {
    case 'cnic':
      return 'ID: XXXXX-XXXXXXX-X';
    case 'email':
      return '[EMAIL REDACTED]';
    case 'api_key':
    case 'password':
    case 'possible_secret':
      return '[SECRET REDACTED]';
    case 'phone':
      return '[PHONE REDACTED]';
    case 'iban':
      return '[ACCOUNT REDACTED]';
    case 'card':
      return '[CARD NUMBER REDACTED]';
    case 'confidential':
      return '[CONFIDENTIAL CONTENT REMOVED]';
    default:
      return '[SECRET REDACTED]';
  }
}

/**
 * Redact sensitive spans in text based on scanner matches.
 * Automatically resolves overlapping or adjacent ranges and preserves unrelated text.
 */
export function redactText(text: string, matches: ScanMatchOffset[]): RedactionResult {
  const disclaimer =
    'Review redaction manually. Patterns can be ambiguous and removing values may change meaning or break source code.';

  if (!text || matches.length === 0) {
    return {
      redactedText: text,
      redactionCount: 0,
      categories: [],
      originalHighlights: [],
      redactedHighlights: [],
      disclaimer,
    };
  }

  // 1. Sort matches by start offset
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);

  // 2. Merge overlapping / adjacent ranges
  const mergedSpans: RedactionSpan[] = [];

  for (const m of sorted) {
    // Ensure bounds within text length
    const start = Math.max(0, Math.min(m.start, text.length));
    const end = Math.max(start, Math.min(m.end, text.length));
    if (start === end) continue;

    const replacement = getPlaceholder(text, start, m.category, m.placeholderType, m.keyPrefix);

    if (mergedSpans.length === 0) {
      mergedSpans.push({
        start,
        end,
        replacement,
        category: m.category,
        severity: m.severity,
      });
      continue;
    }

    const last = mergedSpans[mergedSpans.length - 1];
    if (start <= last.end) {
      // Overlapping or touching span
      last.end = Math.max(last.end, end);
      // If one of the severities is higher, take the higher one
      if (m.severity === 'Critical' || last.severity !== 'Critical') {
        last.severity = m.severity;
      }
      // Combine categories if different
      if (!last.category.includes(m.category)) {
        last.category = `${last.category}, ${m.category}`;
      }
    } else {
      mergedSpans.push({
        start,
        end,
        replacement,
        category: m.category,
        severity: m.severity,
      });
    }
  }

  // 3. Assemble redacted text & compute highlight positions for both original and redacted views
  let redactedText = '';
  let lastIdx = 0;
  const originalHighlights: HighlightSpan[] = [];
  const redactedHighlights: HighlightSpan[] = [];
  const categorySet = new Set<string>();

  for (const span of mergedSpans) {
    // Append preceding safe text
    redactedText += text.slice(lastIdx, span.start);

    // Record original highlight
    originalHighlights.push({
      start: span.start,
      end: span.end,
      severity: span.severity,
      category: span.category,
    });

    // Record redacted highlight
    const redStart = redactedText.length;
    redactedText += span.replacement;
    const redEnd = redactedText.length;

    redactedHighlights.push({
      start: redStart,
      end: redEnd,
      severity: span.severity,
      category: span.category,
    });

    categorySet.add(span.category);
    lastIdx = span.end;
  }

  // Append remaining safe text
  redactedText += text.slice(lastIdx);

  return {
    redactedText,
    redactionCount: mergedSpans.length,
    categories: Array.from(categorySet),
    originalHighlights,
    redactedHighlights,
    disclaimer,
  };
}
