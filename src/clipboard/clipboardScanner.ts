/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClipboardReadResult {
  success: boolean;
  text?: string;
  error?: string;
  permissionDenied?: boolean;
}

/**
 * Safely reads the system clipboard ONLY when explicitly triggered by a user action.
 * No background polling or unsolicited reads.
 */
export async function readClipboardSafe(): Promise<ClipboardReadResult> {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    return {
      success: false,
      error: 'Clipboard API is not supported in this browser or environment.',
    };
  }

  try {
    const text = await navigator.clipboard.readText();
    return {
      success: true,
      text: text || '',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isDenied =
      message.toLowerCase().includes('denied') ||
      message.toLowerCase().includes('not allowed') ||
      message.toLowerCase().includes('permission');

    return {
      success: false,
      permissionDenied: isDenied,
      error: isDenied
        ? 'Clipboard access was blocked or denied by the browser. Please allow clipboard permissions or paste your text manually.'
        : `Unable to read clipboard: ${message}`,
    };
  }
}
