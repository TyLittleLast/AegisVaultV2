import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStorageDurability, requestPersistentStorage } from './storageService'
import { installStorageManager, removeStorageManager } from '../test/setup'

describe('durabilité du stockage', () => {
  afterEach(() => {
    removeStorageManager()
  })

  describe('requestPersistentStorage', () => {
    it('accorde la persistance et renvoie true', async () => {
      const persist = vi.fn(async () => true)
      installStorageManager({ persist } as Partial<StorageManager>)

      await expect(requestPersistentStorage()).resolves.toBe(true)
      expect(persist).toHaveBeenCalledOnce()
    })

    it('refuse et renvoie false quand le navigateur dit non', async () => {
      installStorageManager({ persist: async () => false } as Partial<StorageManager>)
      await expect(requestPersistentStorage()).resolves.toBe(false)
    })

    it('renvoie false si persist() lève', async () => {
      installStorageManager({
        persist: async () => {
          throw new Error('SecurityError')
        },
      } as unknown as Partial<StorageManager>)

      await expect(requestPersistentStorage()).resolves.toBe(false)
    })

    it('renvoie false si l API est absente', async () => {
      installStorageManager({} as Partial<StorageManager>)
      await expect(requestPersistentStorage()).resolves.toBe(false)
    })

    // Regression: the verdict used to be discarded by the caller, which left a
    // button on screen that could never succeed and gave no feedback.
    it('reflète un accord suivi d un état persisté', async () => {
      let persisted = false
      installStorageManager({
        persist: async () => {
          persisted = true
          return true
        },
        persisted: async () => persisted,
        estimate: async () => ({ usage: 512, quota: 4096 }),
      } as Partial<StorageManager>)

      await expect(requestPersistentStorage()).resolves.toBe(true)
      await expect(readStorageDurability()).resolves.toEqual({
        persisted: true,
        usageBytes: 512,
        quotaBytes: 4096,
      })
    })

    it('reflète un refus sans laisser croire à une protection', async () => {
      installStorageManager({
        persist: async () => false,
        persisted: async () => false,
        estimate: async () => ({ usage: 512, quota: 4096 }),
      } as Partial<StorageManager>)

      await expect(requestPersistentStorage()).resolves.toBe(false)
      const durability = await readStorageDurability()
      expect(durability.persisted).toBe(false)
      expect(durability.usageBytes).toBe(512)
    })

    it('ne repasse jamais à un état protégé après un refus', async () => {
      installStorageManager({
        persist: async () => false,
        persisted: async () => false,
      } as Partial<StorageManager>)

      await requestPersistentStorage()
      await requestPersistentStorage()
      await requestPersistentStorage()
      await expect(readStorageDurability()).resolves.toMatchObject({ persisted: false })
    })

    it('bascule à laccordé une fois le statut réellement changé', async () => {
      // Installing the app or bookmarking it can flip the decision later, which
      // is why the card re-reads on visibilitychange rather than caching a
      // verdict forever.
      let persisted = false
      installStorageManager({
        persist: async () => {
          persisted = true
          return true
        },
        persisted: async () => persisted,
      } as Partial<StorageManager>)

      await expect(readStorageDurability()).resolves.toMatchObject({ persisted: false })
      await requestPersistentStorage()
      await expect(readStorageDurability()).resolves.toMatchObject({ persisted: true })
    })
  })

  describe('readStorageDurability', () => {
    it('rapporte un coffre persisté', async () => {
      installStorageManager({
        persisted: async () => true,
        estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }),
      } as Partial<StorageManager>)

      await expect(readStorageDurability()).resolves.toEqual({
        persisted: true,
        usageBytes: 1024,
        quotaBytes: 1024 * 1024,
      })
    })

    it('signale un coffre évincible', async () => {
      installStorageManager({
        persisted: async () => false,
        estimate: async () => ({ usage: 2048, quota: 4096 }),
      } as Partial<StorageManager>)

      const durability = await readStorageDurability()
      expect(durability.persisted).toBe(false)
      expect(durability.usageBytes).toBe(2048)
    })

    it('traite une API absente comme non persisté et inconnue', async () => {
      removeStorageManager()
      await expect(readStorageDurability()).resolves.toEqual({
        persisted: false,
        usageBytes: null,
        quotaBytes: null,
      })
    })

    it('survit à un persisted() qui lève', async () => {
      installStorageManager({
        persisted: async () => {
          throw new Error('denied')
        },
        estimate: async () => ({ usage: 10, quota: 20 }),
      } as unknown as Partial<StorageManager>)

      const durability = await readStorageDurability()
      expect(durability.persisted).toBe(false)
      expect(durability.quotaBytes).toBe(20)
    })

    it('survit à un estimate() qui lève', async () => {
      installStorageManager({
        persisted: async () => true,
        estimate: async () => {
          throw new Error('unavailable')
        },
      } as unknown as Partial<StorageManager>)

      await expect(readStorageDurability()).resolves.toEqual({
        persisted: true,
        usageBytes: null,
        quotaBytes: null,
      })
    })

    it('ignore un quota nul plutôt que d afficher 0/0', async () => {
      installStorageManager({
        persisted: async () => false,
        estimate: async () => ({ usage: 0, quota: 0 }),
      } as Partial<StorageManager>)

      const durability = await readStorageDurability()
      expect(durability.quotaBytes).toBeNull()
      expect(durability.usageBytes).toBeNull()
    })

    it('gère un estimate() sans quota', async () => {
      installStorageManager({
        persisted: async () => false,
        estimate: async () => ({ usage: 99 }),
      } as Partial<StorageManager>)

      const durability = await readStorageDurability()
      expect(durability.quotaBytes).toBeNull()
    })
  })
})
