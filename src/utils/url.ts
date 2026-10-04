const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Validates a user-supplied URL before it is ever placed in an `href`.
 *
 * A naive `includes('://')` test is bypassable — `javascript://%0aalert(1)`
 * passes it — so the scheme is resolved by the URL parser and checked against
 * an allowlist. Returns null for anything not safely navigable.
 */
export function safeExternalUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  const candidate = raw.includes('://') ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/** Hostname without the `www.` prefix, or null if the URL is unusable. */
export function getDomain(raw: string | undefined | null): string | null {
  const safe = safeExternalUrl(raw)
  if (!safe) return null
  try {
    return new URL(safe).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Compact label for display, e.g. `example.com/login` -> `example.com/login`. */
export function displayUrl(raw: string | undefined | null): string {
  if (!raw) return ''
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}
