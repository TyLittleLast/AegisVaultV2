import { argon2id } from 'hash-wasm'
import type { EncryptedPayload } from '../types/vault'

const toBase64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
}

const fromBase64 = (b64: string) =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0))

export async function deriveKey(
  masterPassword: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const rawHash = await argon2id({
    password: masterPassword,
    salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  })

  return crypto.subtle.importKey(
    'raw',
    (rawHash as Uint8Array).buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,   // non-extractable
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(data)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  }
}

export async function decryptData(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return new TextDecoder().decode(plain)
}

export function clearKey(keyRef: { current: CryptoKey | null }) {
  keyRef.current = null
}

export async function createCanary(key: CryptoKey): Promise<EncryptedPayload> {
  return encryptData('CANARY_VALID', key)
}

export async function verifyCanary(
  canary: EncryptedPayload,
  key: CryptoKey
): Promise<boolean> {
  try {
    const result = await decryptData(canary, key)
    return result === 'CANARY_VALID'
  } catch {
    return false
  }
}
