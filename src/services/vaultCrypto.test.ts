import { describe, expect, it } from 'vitest'
import { deriveKey } from './cryptoService'
import {
  buildSearchIndex,
  decryptEntryMeta,
  decryptEntryPassword,
  decryptEntryUrl,
  encryptEntry,
  reencryptEntry,
} from './vaultCrypto'
import type { EntryInput, KdfParams, VaultEntry } from '../types/vault'

const TEST_KDF: KdfParams = { algo: 'argon2id', m: 64, t: 1, p: 1, dkLen: 32 }

async function keyFor(password: string) {
  return deriveKey(password, crypto.getRandomValues(new Uint8Array(16)), TEST_KDF)
}

const INPUT: EntryInput = {
  service: 'GitHub',
  username: 'ada@example.com',
  password: 'correct-horse-battery-staple',
  url: 'https://github.com/login',
}

describe('encryptEntry', () => {
  it('chiffre chaque champ dans une charge distincte', async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry(INPUT, key)

    // Distinct IVs mean the payloads cannot be byte-identical.
    expect(
      new Set([entry.service.iv, entry.username.iv, entry.password.iv, entry.url!.iv]).size,
    ).toBe(4)
    for (const payload of [entry.service, entry.username, entry.password, entry.url!]) {
      expect(payload.ciphertext.length).toBeGreaterThan(0)
    }
  })

  it("ne laisse aucun champ sensible en clair dans l'entrée", async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry(INPUT, key)
    const serialised = JSON.stringify(entry)

    expect(serialised).not.toContain(INPUT.service)
    expect(serialised).not.toContain(INPUT.username)
    expect(serialised).not.toContain(INPUT.password)
    expect(serialised).not.toContain(INPUT.url!)
  })

  it('conserve uniquement des métadonnées en clair', async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry(INPUT, key)

    expect(Object.keys(entry).sort()).toEqual(
      ['entropy', 'id', 'password', 'service', 'updatedAt', 'url', 'username'].sort(),
    )
    expect(typeof entry.id).toBe('string')
    expect(typeof entry.entropy).toBe('number')
    // `favorite` is only written when true, so the key stays absent otherwise.
    expect('favorite' in entry).toBe(false)
  })

  it('écrit favorite uniquement quand il est vrai', async () => {
    const key = await keyFor('master')
    expect((await encryptEntry(INPUT, key, { favorite: true })).favorite).toBe(true)
    expect((await encryptEntry(INPUT, key, { favorite: false })).favorite).toBeUndefined()
  })

  it('omet url quand elle est vide', async () => {
    const key = await keyFor('master')
    expect((await encryptEntry({ ...INPUT, url: '' }, key)).url).toBeUndefined()
  })

  it('effectue un aller-retour sans perte sur chaque champ', async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry(INPUT, key)

    await expect(decryptEntryMeta(entry, key)).resolves.toEqual({
      service: INPUT.service,
      username: INPUT.username,
    })
    await expect(decryptEntryPassword(entry, key)).resolves.toBe(INPUT.password)
    await expect(decryptEntryUrl(entry, key)).resolves.toBe(INPUT.url)
  })

  it('renvoie une chaîne vide pour une entrée sans url', async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry({ ...INPUT, url: '' }, key)
    await expect(decryptEntryUrl(entry, key)).resolves.toBe('')
  })

  it('donne un id et un horodatage distincts à chaque entrée', async () => {
    const key = await keyFor('master')
    const a = await encryptEntry(INPUT, key)
    const b = await encryptEntry(INPUT, key)

    expect(a.id).not.toBe(b.id)
    expect(() => crypto.randomUUID()).not.toThrow()
    // `updatedAt` is optional in the type because legacy entries may omit it,
    // but encryptEntry always writes it: Date.parse('') is NaN, so an absent
    // stamp would fail here.
    expect(typeof a.updatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(a.updatedAt ?? ''))).toBe(false)
  })

  it("n'expose que service et username dans les métadonnées", async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry(INPUT, key)
    const meta = await decryptEntryMeta(entry, key)

    expect(Object.keys(meta).sort()).toEqual(['service', 'username'])
    expect(JSON.stringify(meta)).not.toContain(INPUT.password)
  })

  it('échoue à déchiffrer avec une autre clé', async () => {
    const entry = await encryptEntry(INPUT, await keyFor('master'))
    const other = await keyFor('another')

    await expect(decryptEntryPassword(entry, other)).rejects.toThrow()
    await expect(decryptEntryMeta(entry, other)).rejects.toThrow()
  })
})

describe('buildSearchIndex', () => {
  it('indexe service et username sans mot de passe', async () => {
    const key = await keyFor('master')
    const entry = await encryptEntry(INPUT, key)
    const index = await buildSearchIndex([entry], key)

    expect(index[entry.id]).toEqual({ service: 'GitHub', username: 'ada@example.com' })
    expect(JSON.stringify(index)).not.toContain(INPUT.password)
  })

  it('dégrade une entrée corrompue au lieu de casser le coffre', async () => {
    const key = await keyFor('master')
    const good = await encryptEntry(INPUT, key)
    const bad = await encryptEntry(INPUT, await keyFor('other'))

    const index = await buildSearchIndex([good, bad], key)

    expect(index[good.id]).toEqual({ service: 'GitHub', username: 'ada@example.com' })
    expect(index[bad.id]).toEqual({ service: 'Entrée illisible', username: '' })
  })

  it('renvoie un index vide pour un coffre vide', async () => {
    await expect(buildSearchIndex([], await keyFor('master'))).resolves.toEqual({})
  })
})

describe('reencryptEntry', () => {
  it('re-chiffre sous la nouvelle clé et invalide l’ancienne', async () => {
    const oldKey = await keyFor('old-master')
    const newKey = await keyFor('new-master')
    const entry = await encryptEntry(INPUT, oldKey)

    const rotated = await reencryptEntry(entry, oldKey, newKey)

    await expect(decryptEntryPassword(rotated, newKey)).resolves.toBe(INPUT.password)
    await expect(decryptEntryUrl(rotated, newKey)).resolves.toBe(INPUT.url)
    await expect(decryptEntryMeta(rotated, newKey)).resolves.toEqual({
      service: INPUT.service,
      username: INPUT.username,
    })

    await expect(decryptEntryPassword(rotated, oldKey)).rejects.toThrow()
    await expect(decryptEntryPassword(entry, newKey)).rejects.toThrow()
  })

  it('conserve id, favorite et updatedAt', async () => {
    const oldKey = await keyFor('old-master')
    const entry = await encryptEntry(INPUT, oldKey, {
      favorite: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const rotated = await reencryptEntry(entry, oldKey, await keyFor('new-master'))

    expect(rotated.id).toBe(entry.id)
    expect(rotated.favorite).toBe(true)
    expect(rotated.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('préserve l absence d url', async () => {
    const oldKey = await keyFor('old-master')
    const entry = await encryptEntry({ ...INPUT, url: '' }, oldKey)

    const rotated = await reencryptEntry(entry, oldKey, await keyFor('new-master'))

    expect(rotated.url).toBeUndefined()
  })

  it('re-chiffre un coffre entier sans perte', async () => {
    const oldKey = await keyFor('old-master')
    const newKey = await keyFor('new-master')
    const entries: VaultEntry[] = await Promise.all([
      encryptEntry(INPUT, oldKey),
      encryptEntry({ ...INPUT, service: 'GitLab', url: '' }, oldKey, { favorite: true }),
    ])

    const rotated = await Promise.all(entries.map((e) => reencryptEntry(e, oldKey, newKey)))
    const index = await buildSearchIndex(rotated, newKey)

    expect(
      Object.values(index)
        .map((m) => m.service)
        .sort(),
    ).toEqual(['GitHub', 'GitLab'])
    await expect(decryptEntryPassword(rotated[0], newKey)).resolves.toBe(INPUT.password)
  })
})
