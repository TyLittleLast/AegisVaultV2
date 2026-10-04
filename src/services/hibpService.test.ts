import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { breachCacheSize, checkPasswordBreach, clearBreachCache } from './hibpService'

/** Two distinct suffixes under the same 5-char prefix, plus decoy padding rows. */
function rangeBody(suffixes: Record<string, number>): string {
  const rows = Object.entries(suffixes).map(([s, c]) => `${s}:${c}`)
  // Add-Padding inserts decoys with a count of 0 that must be discarded.
  for (let i = 0; i < 5; i++) rows.push(`PAD${i}0000000000000000000000000000000:0`)
  return rows.join('\r\n')
}

function mockFetch(body: string, ok = true) {
  return vi.fn(async () =>
    ok
      ? new Response(body, { status: 200 })
      : new Response('nope', { status: 503 }),
  )
}

describe('hibpService — k-anonymat', () => {
  beforeEach(() => {
    clearBreachCache()
  })

  afterEach(() => {
    clearBreachCache()
  })

  it("n'envoie jamais le mot de passe ni son empreinte complète", async () => {
    const password = 'Tr0ub4dor&3'
    const fetchSpy = mockFetch(rangeBody({ 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA': 42 }))
    vi.stubGlobal('fetch', fetchSpy)

    await checkPasswordBreach(password)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]

    expect(url).not.toContain(password)
    expect(url).not.toContain(password.toLowerCase())

    // Only the first 5 characters of the SHA-1 may appear, and nothing longer.
    const prefix = url.slice(url.lastIndexOf('/') + 1)
    expect(prefix).toHaveLength(5)
    expect(prefix).toMatch(/^[0-9A-F]{5}$/)

    const body = JSON.stringify(init?.body ?? '')
    expect(body).not.toContain(password)
  })

  it('envoie le header Add-Padding pour masquer la taille de la réponse', async () => {
    const fetchSpy = mockFetch(rangeBody({ 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB': 1 }))
    vi.stubGlobal('fetch', fetchSpy)

    await checkPasswordBreach('correct horse battery staple')

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Add-Padding']).toBe('true')
  })

  it('identifie un mot de passe compromis et son compteur', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    vi.stubGlobal('fetch', mockFetch(rangeBody({ '1E4C9B93F3F0682250B6CF8331B7EE68FD8': 9_659_393 })))

    await expect(checkPasswordBreach('password')).resolves.toEqual({
      isPwned: true,
      count: 9_659_393,
    })
  })

  it('ne confond pas un suffixe avec un autre (correspondance exacte)', async () => {
    // A naive startsWith match would wrongly report a pwn on this prefix.
    vi.stubGlobal('fetch', mockFetch(rangeBody({ '1E4C9B93F3F0682250B6CF8331B7EE68FD0': 5 })))

    await expect(checkPasswordBreach('password')).resolves.toEqual({ isPwned: false, count: 0 })
  })

  it('ignore les lignes de padding (compteur 0)', async () => {
    // The real suffix appears only with a count of 0, i.e. as a decoy.
    vi.stubGlobal('fetch', mockFetch(rangeBody({ '1E4C9B93F3F0682250B6CF8331B7EE68FD8': 0 })))

    await expect(checkPasswordBreach('password')).resolves.toEqual({ isPwned: false, count: 0 })
  })

  it('déduplique les requêtes pour un même préfixe', async () => {
    const fetchSpy = mockFetch(rangeBody({ '1E4C9B93F3F0682250B6CF8331B7EE68FD8': 9_659_393 }))
    vi.stubGlobal('fetch', fetchSpy)

    // Concurrent calls share the in-flight request; later ones hit the cache.
    const [a, b] = await Promise.all([
      checkPasswordBreach('password'),
      checkPasswordBreach('password'),
    ])
    await checkPasswordBreach('password')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(breachCacheSize()).toBe(1)
    expect(a).toEqual(b)
    expect(a.isPwned).toBe(true)
  })

  it('met en cache par préfixe, pas par mot de passe', async () => {
    // SHA-1 is case sensitive, so these are different prefixes and must not
    // share a cache entry. Guards against over-broad cache keys.
    const fetchSpy = mockFetch(rangeBody({ '1E4C9B93F3F0682250B6CF8331B7EE68FD8': 3 }))
    vi.stubGlobal('fetch', fetchSpy)

    await checkPasswordBreach('password')
    await checkPasswordBreach('Password')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(breachCacheSize()).toBe(2)
  })

  it('signale une erreur après épuisement des tentatives', async () => {
    const fetchSpy = vi.fn(async () => new Response('down', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(checkPasswordBreach('whatever')).rejects.toThrow(/503/)
    expect(fetchSpy).toHaveBeenCalledTimes(3) // MAX_ATTEMPTS
  }, 10_000)

  it("n'émet aucune requête si le signal est déjà annulé", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchSpy = mockFetch(rangeBody({}))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(checkPasswordBreach('password', controller.signal)).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})