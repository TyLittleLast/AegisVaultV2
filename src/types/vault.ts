export interface EncryptedPayload {
  iv: string
  ciphertext: string
}

export interface VaultEntry {
  id: string
  service: string
  username: string
  url?: string
  encrypted: EncryptedPayload
  updatedAt?: string   // ISO 8601 — optionnel pour compat coffres existants
  favorite?: boolean
}

export interface HibpResult {
  isPwned: boolean
  count: number
}

export interface VaultStore {
  salt: string          // base64
  canary: EncryptedPayload
  entries: VaultEntry[]
}

export interface AppSettings {
  autoLockMinutes: number
}
