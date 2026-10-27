/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Validates a credit card candidate string using the Luhn algorithm (mod 10).
 * Strips whitespace and dashes. Requires 13 to 19 digits.
 */
export function isValidLuhn(candidate: string): boolean {
  const digitsOnly = candidate.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(digitsOnly)) {
    return false;
  }

  // Reject obvious dummy sequences like all zeroes or 1234567890123
  if (/^0+$/.test(digitsOnly)) {
    return false;
  }

  let sum = 0;
  let alternate = false;

  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = parseInt(digitsOnly.charAt(i), 10);
    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}
