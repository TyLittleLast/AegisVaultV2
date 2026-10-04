export interface EncryptedPayload {
  /** Base64, 12 bytes (96 bits) — random, never reused for a given key. */
  iv: string
  /** Base64 ciphertext with the GCM authentication tag appended. */
  ciphertext: string
}

/**
 * Argon2id parameters, persisted alongside the salt so the vault can be
 * re-derived later (and migrated when OWASP guidance changes).
 *
 * `m` is expressed in KiB, matching the hash-wasm convention.
 * Default values follow RFC 9106 second recommended option
 * (64 MiB / 3 iterations), tuned for a single-threaded browser.
 */
export interface KdfParams {
  algo: 'argon2id'
  /** Memory cost in KiB. */
  m: number
  /** Number of passes over memory. */
  t: number
  /** Degree of parallelism. */
  p: number
  /** Derived key length in bytes (32 = AES-256). */
  dkLen: number
}

export const VAULT_FORMAT_VERSION = 2

/**
 * A single vault entry.
 *
 * Every user-supplied field is encrypted independently — mirroring Bitwarden's
 * model. The only plaintext left is non-secret metadata required to render and
 * sort the list without decrypting anything.
 */
export interface VaultEntry {
  id: string
  favorite?: boolean
  /** ISO 8601. */
  updatedAt?: string
  /** Shannon-ish estimate in bits. Leaks a coarse strength hint, nothing more. */
  entropy?: number
  service: EncryptedPayload
  username: EncryptedPayload
  url?: EncryptedPayload
  password: EncryptedPayload
}

export interface VaultStore {
  /** Format version. Absent means legacy v1. */
  v: number
  kdf: KdfParams
  /** Base64, 16 bytes. */
  salt: string
  /** Decrypts to CANARY_VALID under the correct key; distinguishes wrong password from corrupt vault. */
  canary: EncryptedPayload
  entries: VaultEntry[]
}

export interface AppSettings {
  autoLockMinutes: number
  /** Lock as soon as the window loses focus. */
  lockOnBlur: boolean
  /** Breach checks are opt-in. When false the app makes no network request at all. */
  hibpEnabled: boolean
  /** Epoch ms of the last encrypted export, so backup staleness is visible. */
  lastExportAt?: number
}

export interface EntryInput {
  service: string
  url: string
  username: string
  password: string
}

/**
 * Decrypted, non-secret fields used to render and search the vault list.
 * Populated once at unlock time; never contains a password.
 */
export interface EntrySearchMeta {
  service: string
  username: string
}

export interface HibpResult {
  isPwned: boolean
  count: number
}

/**
 * Format v1 stored only `password` encrypted; `service`, `username` and `url`
 * were plaintext. Undecryptable under the v2 model, so such vaults are refused
 * with an explicit message rather than migrated.
 */
export interface LegacyVaultStore {
  salt: string
  canary: EncryptedPayload
  entries: Array<{
    id: string
    service: string
    username: string
    url?: string
    encrypted: EncryptedPayload
    updatedAt?: string
    favorite?: boolean
  }>
}
