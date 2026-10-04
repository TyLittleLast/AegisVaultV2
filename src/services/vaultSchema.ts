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

export const isKdfParams = (value: unknown): value is KdfParams =>
  isRecord(value) &&
  value.algo === 'argon2id' &&
  typeof value.m === 'number' &&
  value.m > 0 &&
  typeof value.t === 'number' &&
  value.t > 0 &&
  typeof value.p === 'number' &&
  value.p > 0 &&
  typeof value.dkLen === 'number' &&
  value.dkLen > 0

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
  value.entries.every(
    (entry) => isRecord(entry) && typeof entry.service === 'string',
  )

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