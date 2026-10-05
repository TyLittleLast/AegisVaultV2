import type {
  EncryptedPayload,
  KdfParams,
  LegacyVaultStore,
  VaultEntry,
  VaultStore,
} from '../types/vault'
import { VAULT_FORMAT_VERSION } from '../types/vault'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isEncryptedPayload = (value: unknown): value is EncryptedPayload =>
  isRecord(value) &&
  typeof value.iv === 'string' &&
  value.iv.length > 0 &&
  typeof value.ciphertext === 'string' &&
  value.ciphertext.length > 0

/**
 * Acceptable range for the KDF parameters persisted alongside the vault.
 *
 * They are stored so a later version can re-derive the key, which is why they
 * cannot simply be pinned to `DEFAULT_KDF`. They are also attacker-controlled
 * the moment a vault file can be imported, or IndexedDB edited.
 *
 * `deriveKey` runs on the main thread with whatever it is handed, so unbounded
 * values are a denial of service we inflict on ourselves: a file carrying
 * `t: 10_000_000` would freeze every unlock attempt, permanently, because there
 * is no server to reset against. Refusing the file is the only place this is
 * cheap to catch.
 *
 * The floor keeps a stored vault from being trivially weak. The ceiling is 8x
 * the current default — room for an OWASP-driven bump, without letting a file
 * pin the browser to a multi-gigabyte allocation.
 */
export const KDF_LIMITS = {
  /** Argon2's own hard requirement is m >= 8 * p. */
  minMemoryKiB: 8 * 1024,
  maxMemoryKiB: 512 * 1024,
  maxIterations: 16,
  maxParallelism: 16,
  /** AES-256. Also the only key size this format claims to use. */
  derivedKeyBytes: 32,
} as const

export const isKdfParams = (value: unknown): value is KdfParams =>
  isRecord(value) &&
  value.algo === 'argon2id' &&
  typeof value.m === 'number' &&
  Number.isInteger(value.m) &&
  value.m >= KDF_LIMITS.minMemoryKiB &&
  value.m <= KDF_LIMITS.maxMemoryKiB &&
  value.m >= 8 * (typeof value.p === 'number' ? value.p : 1) &&
  typeof value.t === 'number' &&
  Number.isInteger(value.t) &&
  value.t >= 1 &&
  value.t <= KDF_LIMITS.maxIterations &&
  typeof value.p === 'number' &&
  Number.isInteger(value.p) &&
  value.p >= 1 &&
  value.p <= KDF_LIMITS.maxParallelism &&
  value.dkLen === KDF_LIMITS.derivedKeyBytes

const isVaultEntry = (value: unknown): value is VaultEntry =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  isEncryptedPayload(value.service) &&
  isEncryptedPayload(value.username) &&
  isEncryptedPayload(value.password) &&
  (value.url === undefined || isEncryptedPayload(value.url))

/** Structural check only — it cannot tell whether the contents are decryptable. */
export const isVaultStore = (value: unknown): value is VaultStore =>
  isRecord(value) &&
  value.v === VAULT_FORMAT_VERSION &&
  isKdfParams(value.kdf) &&
  typeof value.salt === 'string' &&
  value.salt.length > 0 &&
  isEncryptedPayload(value.canary) &&
  Array.isArray(value.entries) &&
  value.entries.every(isVaultEntry)

/**
 * v1 kept service/username/url in plaintext and encrypted only the password.
 * Those fields cannot be re-encrypted without the plaintext, so a v1 vault is
 * refused rather than silently upgraded.
 */
export const isLegacyVaultStore = (value: unknown): value is LegacyVaultStore =>
  isRecord(value) &&
  value.v === undefined &&
  typeof value.salt === 'string' &&
  isEncryptedPayload(value.canary) &&
  Array.isArray(value.entries) &&
  value.entries.every((entry) => isRecord(entry) && typeof entry.service === 'string')

export type VaultDiagnosis =
  | { kind: 'empty' }
  | { kind: 'current'; store: VaultStore }
  | { kind: 'legacy' }
  | { kind: 'corrupt' }

export function diagnoseVault(value: unknown): VaultDiagnosis {
  if (value === undefined || value === null) return { kind: 'empty' }
  if (isVaultStore(value)) return { kind: 'current', store: value }
  if (isLegacyVaultStore(value)) return { kind: 'legacy' }
  return { kind: 'corrupt' }
}
