import { decryptData, encryptData } from './cryptoService'
import { entropy } from '../utils/password'
import type { EntryInput, EntrySearchMeta, VaultEntry } from '../types/vault'

/**
 * Encrypts every user-supplied field of an entry independently.
 *
 * Per-field encryption (rather than one serialised blob) means the vault list
 * can be rendered from `service` + `username` alone, and a password is only
 * ever decrypted when the entry is explicitly opened. It also mirrors how
 * Bitwarden models ciphers, where every field is its own AEAD payload.
 */
export async function encryptEntry(
  input: EntryInput,
  key: CryptoKey,
  options: { favorite?: boolean; updatedAt?: string } = {},
): Promise<VaultEntry> {
  const [service, username, password] = await Promise.all([
    encryptData(input.service, key),
    encryptData(input.username, key),
    encryptData(input.password, key),
  ])

  const entry: VaultEntry = {
    id: crypto.randomUUID(),
    service,
    username,
    password,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    entropy: entropy(input.password),
  }
  if (input.url) entry.url = await encryptData(input.url, key)
  if (options.favorite) entry.favorite = true
  return entry
}

/** Non-secret fields needed to render and search the list. Never a password. */
export async function decryptEntryMeta(
  entry: VaultEntry,
  key: CryptoKey,
): Promise<EntrySearchMeta> {
  const [service, username] = await Promise.all([
    decryptData(entry.service, key),
    decryptData(entry.username, key),
  ])
  return { service, username }
}

export async function decryptEntryPassword(entry: VaultEntry, key: CryptoKey): Promise<string> {
  return decryptData(entry.password, key)
}

/** Decrypted URL, only called from the detail panel. */
export async function decryptEntryUrl(entry: VaultEntry, key: CryptoKey): Promise<string> {
  return entry.url ? decryptData(entry.url, key) : ''
}

/**
 * Builds the list-time index in one parallel pass. A corrupt entry degrades to
 * placeholder text rather than breaking the whole vault.
 */
export async function buildSearchIndex(
  entries: VaultEntry[],
  key: CryptoKey,
): Promise<Record<string, EntrySearchMeta>> {
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        return [entry.id, await decryptEntryMeta(entry, key)] as const
      } catch {
        return [entry.id, { service: 'Entrée illisible', username: '' }] as const
      }
    }),
  )
  return Object.fromEntries(results)
}

/** Re-encrypts one entry under a new key — used when rotating the master password. */
export async function reencryptEntry(
  entry: VaultEntry,
  oldKey: CryptoKey,
  newKey: CryptoKey,
): Promise<VaultEntry> {
  const [service, url, username, password] = await Promise.all([
    decryptData(entry.service, oldKey),
    entry.url ? decryptData(entry.url, oldKey) : null,
    decryptData(entry.username, oldKey),
    decryptData(entry.password, oldKey),
  ])

  const next: VaultEntry = {
    ...entry,
    service: await encryptData(service, newKey),
    username: await encryptData(username, newKey),
    password: await encryptData(password, newKey),
  }
  if (url !== null) next.url = await encryptData(url, newKey)
  return next
}
