// Provides globalThis.indexedDB so the storage layer can be exercised.
// The suite runs under jsdom (see vitest.config.ts) for the component tests,
// but nothing else is shimmed: WebCrypto and fetch come from Node and the
// service layer still has no DOM dependency of its own.
import 'fake-indexeddb/auto'

/**
 * Minimal StorageManager stub. Left uninstalled by default so the "this
 * runtime has no Storage API" path is what the suite normally exercises;
 * individual tests opt in by installing their own.
 */
export function installStorageManager(partial: Partial<StorageManager>): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...(globalThis.navigator ?? {}), storage: partial },
    configurable: true,
    writable: true,
  })
}

export function removeStorageManager(): void {
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
    writable: true,
  })
}
