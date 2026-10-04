import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  EMPTY_ATTEMPTS,
  MAX_UNLOCK_FAILURES,
  clearUnlockAttempts,
  deleteVault,
  isLockedOut,
  loadSettings,
  loadUnlockAttempts,
  loadVault,
  recordUnlockFailure,
  resetConnectionForTests,
  saveSettings,
  saveUnlockAttempts,
  saveVault,
} from './storageService'
import { encryptEntry } from './vaultCrypto'
import { deriveKey } from './cryptoService'
import { diagnoseVault } from './vaultSchema'
import type { KdfParams, VaultStore } from '../types/vault'

const TEST_KDF: KdfParams = { algo: 'argon2id', m: 64, t: 1, p: 1, dkLen: 32 }

/** Reads the raw persisted bytes, bypassing the typed API. */
async function rawVault(): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('aegisvault')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return new Promise((resolve, reject) => {
    const req = db.transaction('vault', 'readonly').objectStore('vault').get('data')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

describe('storageService', () => {
  beforeEach(async () => {
    resetConnectionForTests()
    await deleteVault().catch(() => undefined)
    await clearUnlockAttempts().catch(() => undefined)
    await saveSettings(DEFAULT_SETTINGS)
  })

  afterEach(() => {
    resetConnectionForTests()
  })

  describe('coffre', () => {
    const store = async (): Promise<VaultStore> => {
      const key = await deriveKey('master', crypto.getRandomValues(new Uint8Array(16)), TEST_KDF)
      return {
        v: 2,
        kdf: TEST_KDF,
        salt: 'c2FsdHNhbHRzYWx0',
        canary: { iv: 'aXY=', ciphertext: 'Y2lwaGVy' },
        entries: [
          await encryptEntry(
            { service: 'GitHub', username: 'ada@example.com', password: 'hunter2-SECRET', url: '' },
            key,
          ),
        ],
      }
    }

    it('fait un aller-retour du coffre', async () => {
      const vault = await store()
      await saveVault(vault)
      await expect(loadVault()).resolves.toEqual(vault)
    })

    it('persiste uniquement du chiffre, jamais de texte en clair', async () => {
      const vault = await store()
      await saveVault(vault)

      const raw = JSON.stringify(await rawVault())
      expect(raw).not.toContain('GitHub')
      expect(raw).not.toContain('ada@example.com')
      expect(raw).not.toContain('hunter2-SECRET')
    })

    it('relit un coffre enregistré et le classe comme courant', async () => {
      await saveVault(await store())
      expect(diagnoseVault(await loadVault()).kind).toBe('current')
    })

    it('renvoie undefined quand aucun coffre n existe', async () => {
      await expect(loadVault()).resolves.toBeUndefined()
      expect(diagnoseVault(await loadVault())).toEqual({ kind: 'empty' })
    })

    it('supprime le coffre', async () => {
      await saveVault(await store())
      await deleteVault()
      await expect(loadVault()).resolves.toBeUndefined()
    })

    it('écrase le coffre précédent', async () => {
      const first = await store()
      await saveVault(first)

      const second = { ...first, entries: [] }
      await saveVault(second)

      const loaded = (await loadVault()) as VaultStore
      expect(loaded.entries).toHaveLength(0)
    })
  })

  describe('préférences', () => {
    it('renvoie les valeurs par défaut en l absence de données', async () => {
      await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS)
    })

    it('fait un aller-retour', async () => {
      const settings = { autoLockMinutes: 15, lockOnBlur: false, hibpEnabled: true }
      await saveSettings(settings)
      await expect(loadSettings()).resolves.toEqual(settings)
    })

    it('complète les champs manquants par les valeurs par défaut', async () => {
      await saveSettings({ autoLockMinutes: 42 } as never)
      await expect(loadSettings()).resolves.toEqual({ ...DEFAULT_SETTINGS, autoLockMinutes: 42 })
    })

    it('laisse HIBP désactivé par défaut', async () => {
      expect(DEFAULT_SETTINGS.hibpEnabled).toBe(false)
    })
  })

  describe('tentatives de déverrouillage', () => {
    it('démarre à zéro', async () => {
      await expect(loadUnlockAttempts()).resolves.toEqual(EMPTY_ATTEMPTS)
    })

    it('fait un aller-retour', async () => {
      await saveUnlockAttempts({ failures: 3, lockedUntil: 123 })
      await expect(loadUnlockAttempts()).resolves.toEqual({ failures: 3, lockedUntil: 123 })
    })

    it('ignore un compteur corrompu', async () => {
      await saveUnlockAttempts({ failures: 'beaucoup', lockedUntil: [] } as never)
      await expect(loadUnlockAttempts()).resolves.toEqual(EMPTY_ATTEMPTS)
    })

    it('remet le compteur à zéro', async () => {
      await saveUnlockAttempts({ failures: 9, lockedUntil: 1 })
      await clearUnlockAttempts()
      await expect(loadUnlockAttempts()).resolves.toEqual(EMPTY_ATTEMPTS)
    })

    it("n'applique aucun délai avant le seuil", async () => {
      const now = 1_000_000
      let attempts = EMPTY_ATTEMPTS
      for (let i = 0; i < MAX_UNLOCK_FAILURES; i++) {
        attempts = await recordUnlockFailure(now)
      }

      expect(attempts.failures).toBe(MAX_UNLOCK_FAILURES)
      expect(attempts.lockedUntil).toBeNull()
      expect(isLockedOut(attempts, now)).toBe(false)
    })

    it('applique un délai progressif au-delà du seuil', async () => {
      const now = 1_000_000
      let attempts = EMPTY_ATTEMPTS
      for (let i = 0; i < MAX_UNLOCK_FAILURES + 1; i++) {
        attempts = await recordUnlockFailure(now)
      }

      expect(attempts.failures).toBe(MAX_UNLOCK_FAILURES + 1)
      expect(attempts.lockedUntil).toBeGreaterThan(now)
      expect(isLockedOut(attempts, now)).toBe(true)
    })

    it('double le délai à chaque échec supplémentaire', async () => {
      const now = 1_000_000
      let previous = 0
      let attempts = EMPTY_ATTEMPTS

      for (let i = 0; i < MAX_UNLOCK_FAILURES + 4; i++) {
        attempts = await recordUnlockFailure(now)
        if (attempts.lockedUntil !== null) {
          const delay = attempts.lockedUntil - now
          expect(delay).toBeGreaterThan(previous)
          previous = delay
        }
      }
    })

    it('plafonne le délai à quinze minutes', async () => {
      const now = 1_000_000
      let attempts = EMPTY_ATTEMPTS
      for (let i = 0; i < 40; i++) {
        attempts = await recordUnlockFailure(now)
      }

      expect(attempts.lockedUntil! - now).toBeLessThanOrEqual(15 * 60_000)
    })

    it('livre le délai à l utilisateur', async () => {
      const now = 1_000_000
      for (let i = 0; i < MAX_UNLOCK_FAILURES + 1; i++) {
        await recordUnlockFailure(now)
      }
      await expect(loadUnlockAttempts()).resolves.toEqual(attemptsOf(now))
    })

    it('libère le verrou une fois le délai écoulé', async () => {
      const now = 1_000_000
      let attempts = EMPTY_ATTEMPTS
      for (let i = 0; i < MAX_UNLOCK_FAILURES + 1; i++) {
        attempts = await recordUnlockFailure(now)
      }

      expect(isLockedOut(attempts, now + 119_000)).toBe(true)
      expect(isLockedOut(attempts, now + 121_000)).toBe(false)
    })

    it('ne verrouille jamais quand lockedUntil est null', () => {
      expect(isLockedOut(EMPTY_ATTEMPTS)).toBe(false)
      expect(isLockedOut({ failures: 99, lockedUntil: null })).toBe(false)
    })
  })
})

/** The 6th failure is the first over the threshold: 2^1 × the 60 s base. */
function attemptsOf(now: number) {
  return { failures: MAX_UNLOCK_FAILURES + 1, lockedUntil: now + 120_000 }
}