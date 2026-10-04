/**
 * Clipboard handling for secrets.
 *
 * A copied password outlives the vault lock: it lives in the OS clipboard
 * until something else overwrites it. Web apps — unlike browser extensions,
 * which lack clipboard permissions — can overwrite it themselves, so every
 * copy is scheduled for erasure.
 */

export const CLIPBOARD_TTL_MS = 30_000

let clearTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Overwrite the clipboard with a single space. This is a best effort: the page
 * must stay focused for `writeText` to be permitted, and some OS clipboard
 * managers keep their own history regardless. It still shortens the exposure
 * window substantially.
 */
export async function clearClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText(' ')
  } catch {
    // Permission denied or insecure context — nothing more we can do.
  }
}

export async function copySecret(
  value: string,
  ttlMs: number = CLIPBOARD_TTL_MS,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    return false
  }
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    clearTimer = null
    void clearClipboard()
  }, ttlMs)
  return true
}

export function cancelScheduledClear(): void {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
}
