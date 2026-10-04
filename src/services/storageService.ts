import type { AppSettings, VaultStore } from '../types/vault'

const DB_NAME = 'aegisvault'
const DB_VERSION = 1
const STORE_VAULT = 'vault'
const STORE_SETTINGS = 'settings'
const VAULT_KEY = 'data'
const SETTINGS_KEY = 'prefs'
const ATTEMPTS_KEY = 'unlock-attempts'

export const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  lockOnBlur: true,
  hibpEnabled: false,
}

export interface UnlockAttempts {
  failures: number
  /** Epoch ms before which unlocking is refused, or null. */
  lockedUntil: number | null
}

export const EMPTY_ATTEMPTS: UnlockAttempts = { failures: 0, lockedUntil: null }
export const MAX_UNLOCK_FAILURES = 5
const BASE_LOCKOUT_MS = 60_000
const MAX_LOCKOUT_MS = 15 * 60_000

/**
 * One connection for the whole session. Opening per call would leak a
 * connection every time and can exhaust the browser's connection budget.
 */
let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_VAULT)) db.createObjectStore(STORE_VAULT)
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) db.createObjectStore(STORE_SETTINGS)
    }
    req.onsuccess = () => {
      const db = req.result
      // A version change from another tab invalidates this handle.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('IndexedDB unavailable'))
    }
    req.onblocked = () => {
      dbPromise = null
      reject(new Error('IndexedDB blocked by another tab'))
    }
  })

  return dbPromise
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDB()
  return request<T | undefined>(db.transaction(store, 'readonly').objectStore(store).get(key))
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDB()
  await request(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
}

async function idbDelete(store: string, key: string): Promise<void> {
  const db = await openDB()
  await request(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

/** Returns `unknown`: the caller validates the shape via `diagnoseVault`. */
export async function loadVault(): Promise<unknown> {
  return idbGet<VaultStore>(STORE_VAULT, VAULT_KEY)
}

export async function saveVault(vault: VaultStore): Promise<void> {
  await idbPut(STORE_VAULT, VAULT_KEY, vault)
}

export async function deleteVault(): Promise<void> {
  await idbDelete(STORE_VAULT, VAULT_KEY)
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await idbGet<Partial<AppSettings>>(STORE_SETTINGS, SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await idbPut(STORE_SETTINGS, SETTINGS_KEY, settings)
}

/**
 * Persisted unlock-failure counter.
 *
 * Argon2 already makes each guess expensive, so this does not protect against
 * offline brute force — nothing in the browser could. What it does stop is a
 * casual walk-up-and-try on an unlocked machine, which is the realistic threat
 * for a local-only vault.
 */
export async function loadUnlockAttempts(): Promise<UnlockAttempts> {
  const stored = await idbGet<Partial<UnlockAttempts>>(STORE_SETTINGS, ATTEMPTS_KEY)
  return {
    failures: typeof stored?.failures === 'number' ? stored.failures : 0,
    lockedUntil: typeof stored?.lockedUntil === 'number' ? stored.lockedUntil : null,
  }
}

export async function saveUnlockAttempts(attempts: UnlockAttempts): Promise<void> {
  await idbPut(STORE_SETTINGS, ATTEMPTS_KEY, attempts)
}

export function isLockedOut(attempts: UnlockAttempts, now = Date.now()): boolean {
  return attempts.lockedUntil !== null && attempts.lockedUntil > now
}

export interface StorageDurability {
  /** True once the browser has agreed not to evict this origin under pressure. */
  persisted: boolean
  usageBytes: number | null
  quotaBytes: number | null
}

/**
 * Whether the origin can be evicted by the browser at all.
 *
 * Absent in Node and in some embedded contexts, so every caller has to cope
 * with "we cannot even tell" — treated as not persisted, which is the honest
 * default for a vault whose only copy lives here.
 */
function storageManager(): StorageManager | null {
  return typeof navigator !== 'undefined' ? (navigator.storage ?? null) : null
}

/**
 * Asks the browser to stop evicting this origin's storage.
 *
 * Best effort and legitimately allowed to fail: Chrome grants it based on
 * engagement (installed, bookmarked, frequently used), Firefox is generous, and
 * Safari largely ignores it. The answer is surfaced to the user rather than
 * assumed, because a silent denial is indistinguishable from data loss later.
 *
 * Call this from a user-initiated moment — an automatic grant is far more
 * likely right after the vault is created or unlocked than on page load.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const manager = storageManager()
  if (!manager?.persist) return false
  try {
    return await manager.persist()
  } catch {
    return false
  }
}

export async function readStorageDurability(): Promise<StorageDurability> {
  const manager = storageManager()
  if (!manager) return { persisted: false, usageBytes: null, quotaBytes: null }

  let persisted: boolean
  try {
    persisted = (await manager.persisted?.()) ?? false
  } catch {
    persisted = false
  }

  let usageBytes: number | null = null
  let quotaBytes: number | null = null
  try {
    const estimate = await manager.estimate?.()
    // A quota of 0 would render as "0 / 0", so treat it as unknown.
    if (estimate && estimate.quota) {
      usageBytes = estimate.usage ?? null
      quotaBytes = estimate.quota
    }
  } catch {
    usageBytes = null
    quotaBytes = null
  }

  return { persisted, usageBytes, quotaBytes }
}

/** Records a failure and returns the resulting state, with a growing lockout. */
export async function recordUnlockFailure(now = Date.now()): Promise<UnlockAttempts> {
  const current = await loadUnlockAttempts()
  const failures = current.failures + 1
  const over = Math.max(0, failures - MAX_UNLOCK_FAILURES)
  const next: UnlockAttempts = {
    failures,
    lockedUntil: over > 0 ? now + Math.min(BASE_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS) : null,
  }
  await saveUnlockAttempts(next)
  return next
}

export async function clearUnlockAttempts(): Promise<void> {
  await saveUnlockAttempts(EMPTY_ATTEMPTS)
}

/** Test seam — drops the cached connection. */
export function resetConnectionForTests(): void {
  dbPromise = null
}
