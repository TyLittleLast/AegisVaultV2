import { describe, expect, it } from 'vitest'
import {
  diagnoseVault,
  isEncryptedPayload,
  isKdfParams,
  isLegacyVaultStore,
  isVaultStore,
} from './vaultSchema'
import { VAULT_FORMAT_VERSION, type VaultStore } from '../types/vault'

const PAYLOAD = { iv: 'aXYtZXhhbXBsZQ==', ciphertext: 'Y2lwaGVydGV4dA==' }

const validStore = (): VaultStore => ({
  v: VAULT_FORMAT_VERSION,
  kdf: { algo: 'argon2id', m: 65_536, t: 3, p: 1, dkLen: 32 },
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  canary: PAYLOAD,
  entries: [],
})

describe('isEncryptedPayload', () => {
  it('accepte une charge valide', () => {
    expect(isEncryptedPayload(PAYLOAD)).toBe(true)
  })

  it('refuse une charge incomplète', () => {
    expect(isEncryptedPayload({ iv: 'a' })).toBe(false)
    expect(isEncryptedPayload({ ciphertext: 'b' })).toBe(false)
    expect(isEncryptedPayload({ iv: '', ciphertext: 'b' })).toBe(false)
    expect(isEncryptedPayload({ iv: 'a', ciphertext: '' })).toBe(false)
    expect(isEncryptedPayload({ iv: 1, ciphertext: 2 })).toBe(false)
    expect(isEncryptedPayload(null)).toBe(false)
    expect(isEncryptedPayload('nope')).toBe(false)
  })
})

describe('isKdfParams', () => {
  it("n'accepte que argon2id avec des coûts positifs", () => {
    expect(isKdfParams({ algo: 'argon2id', m: 65536, t: 3, p: 1, dkLen: 32 })).toBe(true)
    expect(isKdfParams({ algo: 'pbkdf2', m: 65536, t: 3, p: 1, dkLen: 32 })).toBe(false)
    expect(isKdfParams({ algo: 'argon2id', m: 0, t: 3, p: 1, dkLen: 32 })).toBe(false)
    expect(isKdfParams({ algo: 'argon2id', m: -1, t: 3, p: 1, dkLen: 32 })).toBe(false)
    expect(isKdfParams({ algo: 'argon2id', m: 'lots', t: 3, p: 1, dkLen: 32 })).toBe(false)
    expect(isKdfParams(null)).toBe(false)
  })
})

describe('isVaultStore', () => {
  it('accepte un coffre v2 valide', () => {
    expect(isVaultStore(validStore())).toBe(true)
    expect(VAULT_FORMAT_VERSION).toBe(2)
  })

  it('accepte une entrée dont url est absent', () => {
    const store = validStore()
    store.entries = [
      { id: 'e1', service: PAYLOAD, username: PAYLOAD, password: PAYLOAD, favorite: true },
    ] as never
    expect(isVaultStore(store)).toBe(true)
  })

  it("refuse une entrée dont un champ sensible est en clair", () => {
    const store = validStore()
    store.entries = [
      { id: 'e1', service: 'github', username: PAYLOAD, password: PAYLOAD },
    ] as never
    expect(isVaultStore(store)).toBe(false)
  })

  it("refuse un coffre avec une version inconnue", () => {
    expect(isVaultStore({ ...validStore(), v: 3 })).toBe(false)
    expect(isVaultStore({ ...validStore(), v: 1 })).toBe(false)
    expect(isVaultStore({ ...validStore(), v: undefined })).toBe(false)
  })

  it('refuse un coffre sans canary ou sans sel', () => {
    expect(isVaultStore({ ...validStore(), canary: undefined })).toBe(false)
    expect(isVaultStore({ ...validStore(), salt: '' })).toBe(false)
  })

  it('refuse les types non-objet', () => {
    for (const bad of [null, undefined, 'vault', 42, [], true]) {
      expect(isVaultStore(bad)).toBe(false)
    }
  })
})

/** v1 as it was actually written: service/username/url in plaintext, only a
 *  single `encrypted` blob per entry, and no `v`/`kdf` markers. */
const legacyStore = () => ({
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  canary: PAYLOAD,
  entries: [{ id: 'e1', service: 'github', username: 'ada@example.com', encrypted: PAYLOAD }],
})

describe('isLegacyVaultStore', () => {
  it("reconnaît un coffre v1 avec champs en clair", () => {
    expect(isLegacyVaultStore(legacyStore())).toBe(true)
  })

  it('ne confond pas un coffre v2 avec un v1', () => {
    expect(isLegacyVaultStore(validStore())).toBe(false)
  })

  it('ne prend pas un coffre sans sel ni canary pour un v1', () => {
    expect(isLegacyVaultStore({ entries: [] })).toBe(false)
  })
})

describe('diagnoseVault', () => {
  it('classe une absence de données comme vide', () => {
    expect(diagnoseVault(undefined)).toEqual({ kind: 'empty' })
    expect(diagnoseVault(null)).toEqual({ kind: 'empty' })
  })

  it('classe un coffre v2 comme courant', () => {
    const store = validStore()
    const result = diagnoseVault(store)
    expect(result.kind).toBe('current')
    if (result.kind === 'current') expect(result.store).toBe(store)
  })

  it('classe un coffre v1 comme legacy, sans le migrer', () => {
    expect(diagnoseVault(legacyStore())).toEqual({ kind: 'legacy' })
  })

  it('classe une structure inconnue comme corrompue', () => {
    expect(diagnoseVault({ hello: 'world' })).toEqual({ kind: 'corrupt' })
    expect(diagnoseVault(123)).toEqual({ kind: 'corrupt' })
    expect(diagnoseVault([])).toEqual({ kind: 'corrupt' })
  })
})