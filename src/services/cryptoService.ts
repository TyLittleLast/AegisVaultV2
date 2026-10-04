import { argon2id } from 'hash-wasm'
import type { EncryptedPayload, KdfParams } from '../types/vault'

/**
 * RFC 9106 second recommended option (memory-constrained environments),
 * with p=1 because the browser main thread is single-threaded.
 */
export const DEFAULT_KDF: KdfParams = {
  algo: 'argon2id',
  m: 65_536, // 64 MiB
  t: 3,
  p: 1,
  dkLen: 32,
}

const CANARY_PLAINTEXT = 'CANARY_VALID'
const SALT_BYTES = 16
const IV_BYTES = 12

/** `Uint8Array` backed by a plain `ArrayBuffer`, which Web Crypto requires. */
type Bytes = Uint8Array<ArrayBuffer>

/** Chunked to stay well under the engine's argument limit on large payloads. */
const toBase64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const fromBase64 = (b64: string): Bytes => {
  const binary = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const randomBytes = (length: number): Bytes =>
  crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)))

export const generateSalt = (): Bytes => randomBytes(SALT_BYTES)

export const toBase64Salt = (salt: Uint8Array): string => toBase64(salt)

export const fromBase64Salt = (b64: string): Bytes => fromBase64(b64)

/**
 * Stretch the master password into a non-extractable AES-256-GCM key.
 *
 * The derived key never leaves this function: `importKey` is called with
 * `extractable: false`, so it cannot be read back out of the CryptoKey.
 */
export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<CryptoKey> {
  const raw = await argon2id({
    password: masterPassword,
    salt,
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: kdf.dkLen,
    outputType: 'binary',
  })

  // Copy into an exactly-sized buffer rather than handing over `raw.buffer`,
  // which may be a larger pooled allocation.
  const material = new Uint8Array(new ArrayBuffer(raw.length))
  material.set(raw)

  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptData(data: string, key: CryptoKey): Promise<EncryptedPayload> {
  // Fresh IV per encryption. Never derived from the key or the plaintext.
  const iv = randomBytes(IV_BYTES)
  const encoded = new TextEncoder().encode(data)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) }
}

export async function decryptData(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plain)
}

/**
 * Best-effort only: JavaScript offers no way to zero a CryptoKey or guarantee
 * a string is scrubbed before garbage collection. Dropping the reference lets
 * the key become unreachable, which is the strongest guarantee available in
 * this runtime. Do not describe this as secure memory erasure.
 */
export function clearKey(keyRef: { current: CryptoKey | null }): void {
  keyRef.current = null
}

export async function createCanary(key: CryptoKey): Promise<EncryptedPayload> {
  return encryptData(CANARY_PLAINTEXT, key)
}

/**
 * Returns false both for a wrong password and for a corrupted vault; the two
 * cases are intentionally indistinguishable to avoid leaking vault state.
 */
export async function verifyCanary(canary: EncryptedPayload, key: CryptoKey): Promise<boolean> {
  try {
    return (await decryptData(canary, key)) === CANARY_PLAINTEXT
  } catch {
    return false
  }
}
