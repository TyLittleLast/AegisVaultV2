import type { AppSettings, VaultStore } from '../types/vault'

const DB_NAME = 'aegisvault'
const DB_VERSION = 1
const STORE_VAULT = 'vault'
const STORE_SETTINGS = 'settings'
const VAULT_KEY = 'data'
const SETTINGS_KEY = 'prefs'

export const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  lockOnBlur: true,
  hibpEnabled: false,
}

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

/** Test seam — drops the cached connection. */
export function resetConnectionForTests(): void {
  dbPromise = null
}