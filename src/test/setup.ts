// Provides globalThis.indexedDB so the storage layer can be exercised in Node.
// Nothing else is shimmed: the suite deliberately runs without a DOM, which
// keeps it honest about the service layer having no rendering dependencies.
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
