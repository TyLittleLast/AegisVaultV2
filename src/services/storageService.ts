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
