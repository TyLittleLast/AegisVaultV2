import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KDF,
  clearKey,
  createCanary,
  decryptData,
  deriveKey,
  encryptData,
  fromBase64Salt,
  generateSalt,
  verifyCanary,
} from './cryptoService'
import type { KdfParams } from '../types/vault'

/**
 * The production KDF costs ~200ms and 64 MiB per call. Tests use the minimum
 * Argon2 accepts so the suite stays fast; the production parameters are
 * asserted separately below.
 */
/**
 * Base64 helpers built on the Web APIs the app itself targets, so the suite
 * needs no Node type definitions. `Buffer` would drag @types/node into a
 * browser-only project.
 */
const bytesOf = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const b64Of = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const flipBit = (b64: string, index: number): string => {
  const bytes = bytesOf(b64)
  bytes[index] = (bytes[index] as number) ^ 0x01
  return b64Of(bytes)
}
const truncate = (b64: string, keep: number): string => b64Of(bytesOf(b64).slice(0, keep))

const TEST_KDF: KdfParams = { algo: 'argon2id', m: 64, t: 1, p: 1, dkLen: 32 }

async function keyFor(password: string, salt = generateSalt(), kdf = TEST_KDF) {
  return deriveKey(password, salt, kdf)
}

describe('deriveKey', () => {
  it("produit une clé non extractible", async () => {
    const key = await keyFor('master')
    expect(key.extractable).toBe(false)

    // Nothing to read back out, by construction.
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('autorise uniquement encrypt et decrypt', async () => {
    const key = await keyFor('master')
    expect(key.usages).toEqual(['encrypt', 'decrypt'])
  })

  it('dérive la même clé pour le même mot de passe et le même sel', async () => {
    const salt = generateSalt()
    const a = await encryptData('secret', await keyFor('master', salt))
    const b = await encryptData('secret', await keyFor('master', salt))
    await expect(decryptData(b, await keyFor('master', salt))).resolves.toBe('secret')
    await expect(decryptData(a, await keyFor('master', salt))).resolves.toBe('secret')
  })

  it('dérive des clés différentes pour des sels différents', async () => {
    const payload = await encryptData('secret', await keyFor('master', generateSalt()))
    await expect(decryptData(payload, await keyFor('master', generateSalt()))).rejects.toThrow()
  })

  it('dérive des clés différentes pour des mots de passe différents', async () => {
    const salt = generateSalt()
    const payload = await encryptData('secret', await keyFor('master-a', salt))
    await expect(decryptData(payload, await keyFor('master-b', salt))).rejects.toThrow()
  })

  it('respecte les paramètres de coût fournis', async () => {
    const salt = generateSalt()
    const cheap = await encryptData('x', await keyFor('p', salt, TEST_KDF))
    const heavy = await encryptData('x', await keyFor('p', salt, { ...TEST_KDF, t: 2 }))

    // A different iteration count must yield a different key, so one payload
    // cannot be read with a key derived under the other parameters.
    await expect(decryptData(heavy, await keyFor('p', salt, TEST_KDF))).rejects.toThrow()
    await expect(decryptData(cheap, await keyFor('p', salt, { ...TEST_KDF, t: 2 }))).rejects.toThrow()
  })

  it('conserve les paramètres de production du cahier des charges', () => {
    expect(DEFAULT_KDF).toEqual({ algo: 'argon2id', m: 65_536, t: 3, p: 1, dkLen: 32 })
  })

  it('génère un sel de 16 octets distinct à chaque appel', () => {
    const a = generateSalt()
    const b = generateSalt()
    expect(a).toHaveLength(16)
    expect(b64Of(a)).not.toBe(b64Of(b))
  })

  it('effectue un aller-retour base64 sans perte', () => {
    const salt = generateSalt()
    expect(fromBase64Salt(b64Of(salt))).toEqual(salt)
  })
})

describe('encryptData / decryptData', () => {
  it('fait un aller-retour exact, y compris sur des caractères non-ASCII', async () => {
    const key = await keyFor('master')
    for (const plaintext of ['', 'a', 'mot de passe', '🔐 émoji ÿ', 'x'.repeat(4096)]) {
      await expect(decryptData(await encryptData(plaintext, key), key)).resolves.toBe(plaintext)
    }
  })

  it('utilise un IV de 12 octets distinct à chaque chiffrement', async () => {
    const key = await keyFor('master')
    const ivs = new Set<string>()
    for (let i = 0; i < 25; i++) {
      const payload = await encryptData('same plaintext', key)
      expect(bytesOf(payload.iv)).toHaveLength(12)
      ivs.add(payload.iv)
    }
    expect(ivs.size).toBe(25)
  })

  it('ne produit jamais le même ciphertext pour un même texte', async () => {
    const key = await keyFor('master')
    const a = await encryptData('same plaintext', key)
    const b = await encryptData('same plaintext', key)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('ne laisse pas fuiter le texte en clair dans la sortie', async () => {
    const key = await keyFor('master')
    const secret = 'SUPER-SECRET-TOKEN'
    const payload = await encryptData(secret, key)
    expect(payload.ciphertext).not.toContain(secret)
    expect(JSON.stringify(payload)).not.toContain(secret)
  })

  it('rejette un ciphertext modifié (authentification GCM)', async () => {
    const key = await keyFor('master')
    const payload = await encryptData('secret value', key)

    // Flip one bit of the ciphertext: GCM must reject it.
    const tampered = { ...payload, ciphertext: flipBit(payload.ciphertext, 0) }
    await expect(decryptData(tampered, key)).rejects.toThrow()
  })

  it('rejette un IV modifié', async () => {
    const key = await keyFor('master')
    const payload = await encryptData('secret value', key)

    await expect(
      decryptData({ ...payload, iv: flipBit(payload.iv, 0) }, key),
    ).rejects.toThrow()
  })

  it('rejette une charge utile tronquée', async () => {
    const key = await keyFor('master')
    const payload = await encryptData('secret value', key)
    const short = truncate(payload.ciphertext, 4)

    await expect(decryptData({ ...payload, ciphertext: short }, key)).rejects.toThrow()
  })

  it('rejette une structure malformée', async () => {
    const key = await keyFor('master')
    for (const bad of [
      { iv: '', ciphertext: '' },
      { iv: 'not base64!!', ciphertext: 'AAAA' },
      { iv: 42, ciphertext: null },
      {},
    ]) {
      await expect(decryptData(bad as never, key)).rejects.toThrow()
    }
  })
})

describe('canary', () => {
  it('vaut true pour la bonne clé', async () => {
    const key = await keyFor('master')
    await expect(verifyCanary(await createCanary(key), key)).resolves.toBe(true)
  })

  it('vaut false pour un mauvais mot de passe, sans lever', async () => {
    const salt = generateSalt()
    const canary = await createCanary(await keyFor('master', salt))
    await expect(verifyCanary(canary, await keyFor('wrong', salt))).resolves.toBe(false)
  })

  it('vaut false pour un canary corrompu', async () => {
    const key = await keyFor('master')
    await expect(verifyCanary({ iv: 'AAAA', ciphertext: 'AAAA' }, key)).resolves.toBe(false)
  })

  it('reste stable sur plusieurs vérifications', async () => {
    const key = await keyFor('master')
    const canary = await createCanary(key)
    for (let i = 0; i < 3; i++) {
      await expect(verifyCanary(canary, key)).resolves.toBe(true)
    }
  })
})

describe('clearKey', () => {
  it('détache la référence de la clé', () => {
    const ref: { current: CryptoKey | null } = { current: {} as CryptoKey }
    clearKey(ref)
    expect(ref.current).toBeNull()
  })
})