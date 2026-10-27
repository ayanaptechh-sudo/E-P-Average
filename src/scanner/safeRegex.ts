/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if a regex pattern contains dangerous nested repetition patterns that could lead to ReDoS.
 */
export function isSafeRegex(pattern: string, flags?: string): { safe: boolean; error?: string } {
  try {
    // 0. Reject inline flags like (?i) or (?m) which JavaScript RegExp does not support
    if (pattern.includes('(?i)') || pattern.includes('(?m)')) {
      return {
        safe: false,
        error: 'JavaScript regular expressions do not support inline flags (?i) or (?m). Please use the Regex Flags field (e.g. "gi", "gim") instead.',
      };
    }

    // 1. Try compiling
    new RegExp(pattern, flags);

    // 2. Check for catastrophic nested quantifiers: (.*)+, ([a-z]+)*, (a+){2,}, etc.
    const dangerousNestedPattern = /\([^)]*(\+|\*|\{\d+,?\d*\})\)[*+]/;
    if (dangerousNestedPattern.test(pattern)) {
      return {
        safe: false,
        error: 'Pattern contains nested quantifiers that can cause catastrophic backtracking (ReDoS).',
      };
    }

    // 3. Check for repeated alternating groups with overlaps: (a|aa)+
    const repeatedGroup = /\(([^)]+)\|([^)]+)\)[*+]/;
    if (repeatedGroup.test(pattern)) {
      // Flag potential duplicate prefixes
      const match = pattern.match(repeatedGroup);
      if (match && (match[1].startsWith(match[2]) || match[2].startsWith(match[1]))) {
        return {
          safe: false,
          error: 'Pattern contains overlapping alternating branches with repetition.',
        };
      }
    }

    return { safe: true };
  } catch (err: unknown) {
    return {
      safe: false,
      error: err instanceof Error ? err.message : 'Invalid regular expression syntax',
    };
  }
}
