import type { HibpResult } from '../types/vault'

const RANGE_ENDPOINT = 'https://api.pwnedpasswords.com/range'
/** HIBP k-anonymity splits the SHA-1 at 5 hex characters. */
const PREFIX_LEN = 5
const MAX_ATTEMPTS = 3
const BACKOFF_MS = 250

/**
 * prefix -> (suffix -> breach count).
 *
 * Keyed by prefix rather than by full hash so that two passwords sharing a
 * prefix cost a single request, while still resolving each suffix locally.
 * Caching by full hash would be wrong: the response depends only on the prefix.
 */
const rangeCache = new Map<string, Map<string, number>>()
const inFlight = new Map<string, Promise<Map<string, number>>>()

async function sha1HexUpper(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function parseRange(body: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const line of body.split('\r\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const suffix = line.slice(0, sep)
    const count = Number(line.slice(sep + 1))
    // Rows added by Add-Padding are decoys with a count of 0; a real breach
    // record always has at least one sighting, so 0 means "discard".
    if (count > 0) map.set(suffix, count)
  }
  return map
}

async function fetchRange(prefix: string, signal?: AbortSignal): Promise<Map<string, number>> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    signal?.throwIfAborted()
    try {
      const res = await fetch(`${RANGE_ENDPOINT}/${prefix}`, {
        // Asks HIBP to pad the response to a random 800-1000 rows so an
        // observer cannot infer how common this prefix is from response size.
        headers: { 'Add-Padding': 'true' },
        signal,
      })
      if (!res.ok) throw new Error(`HIBP indisponible (HTTP ${res.status})`)
      return parseRange(await res.text())
    } catch (err) {
      lastError = err
      if (signal?.aborted || attempt === MAX_ATTEMPTS) throw err
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

function loadRange(prefix: string, signal?: AbortSignal): Promise<Map<string, number>> {
  const cached = rangeCache.get(prefix)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(prefix)
  if (pending) return pending

  const task = fetchRange(prefix, signal).then(
    (map) => {
      rangeCache.set(prefix, map)
      inFlight.delete(prefix)
      return map
    },
    (err: unknown) => {
      inFlight.delete(prefix)
      throw err
    },
  )
  inFlight.set(prefix, task)
  return task
}

/**
 * Breach lookup via k-anonymity: only the first 5 characters of the SHA-1 hash
 * ever leave the device. The remaining 35 are compared against the returned
 * list locally, so neither the password nor its full hash is ever transmitted.
 *
 * Only called when the user has explicitly enabled breach checking.
 */
export async function checkPasswordBreach(
  password: string,
  signal?: AbortSignal,
): Promise<HibpResult> {
  const hex = await sha1HexUpper(password)
  const prefix = hex.slice(0, PREFIX_LEN)
  const suffix = hex.slice(PREFIX_LEN)
  const map = await loadRange(prefix, signal)
  const count = map.get(suffix) ?? 0
  return { isPwned: count > 0, count }
}

/** Test seam. */
export function clearBreachCache(): void {
  rangeCache.clear()
  inFlight.clear()
}

/** Test seam — exposes the cache size for deduplication assertions. */
export function breachCacheSize(): number {
  return rangeCache.size
}
