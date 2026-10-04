import type { HibpResult } from '../types/vault'

export async function checkPasswordBreach(password: string): Promise<HibpResult> {
  const encoded = new TextEncoder().encode(password)
  const hashBuf = await crypto.subtle.digest('SHA-1', encoded)
  const hex = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

  const prefix = hex.slice(0, 5)
  const suffix = hex.slice(5)

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`)
  if (!res.ok) throw new Error('HIBP API unavailable')

  const text = await res.text()
  const match = text
    .split('\r\n')
    .find(line => line.startsWith(suffix))

  const count = match ? parseInt(match.split(':')[1], 10) : 0
  return { isPwned: count > 0, count }
}
