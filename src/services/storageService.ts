import type { VaultStore, AppSettings } from '../types/vault'

const DB_NAME = 'aegisvault'
const DB_VERSION = 1
const STORE_VAULT = 'vault'
const STORE_SETTINGS = 'settings'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_VAULT)
      req.result.createObjectStore(STORE_SETTINGS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function loadVault(): Promise<VaultStore | undefined> {
  const db = await openDB()
  return idbGet<VaultStore>(db, STORE_VAULT, 'data')
}

export async function saveVault(vault: VaultStore): Promise<void> {
  const db = await openDB()
  await idbPut(db, STORE_VAULT, 'data', vault)
}

export async function deleteVault(): Promise<void> {
  const db = await openDB()
  await idbDelete(db, STORE_VAULT, 'data')
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await openDB()
  const s = await idbGet<AppSettings>(db, STORE_SETTINGS, 'prefs')
  return s ?? { autoLockMinutes: 5 }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await openDB()
  await idbPut(db, STORE_SETTINGS, 'prefs', settings)
}
