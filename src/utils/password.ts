/**
 * Single source of truth for password strength and generation.
 * Every view imports from here so the indicator looks identical everywhere.
 */

const CHARSETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // I, O removed
  upperFull: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghjkmnpqrstuvwxyz', // l removed
  lowerFull: 'abcdefghijklmnopqrstuvwxyz',
  digits: '23456789', // 0, 1 removed
  digitsFull: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
} as const

export const MIN_PASSWORD_LENGTH = 8

export interface GeneratorOptions {
  length?: number
  upper?: boolean
  lower?: boolean
  digits?: boolean
  symbols?: boolean
  excludeAmbiguous?: boolean
}

/** Character pool implied by the options. Empty when every class is disabled. */
export function buildPool(options: GeneratorOptions): string {
  const { upper = true, lower = true, digits = true, symbols = true, excludeAmbiguous = false } = options
  let pool = ''
  if (upper) pool += excludeAmbiguous ? CHARSETS.upper : CHARSETS.upperFull
  if (lower) pool += excludeAmbiguous ? CHARSETS.lower : CHARSETS.lowerFull
  if (digits) pool += excludeAmbiguous ? CHARSETS.digits : CHARSETS.digitsFull
  if (symbols) pool += CHARSETS.symbols
  return pool
}

/**
 * Entropy estimate in bits, based on the size of the character pool the
 * password actually uses. Cheap and charset-based: it does not model
 * patterns or dictionary words, so treat it as an upper bound.
 */
export function entropy(password: string): number {
  if (!password) return 0
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 32
  return pool > 0 ? Math.floor(password.length * Math.log2(pool)) : 0
}

/** Bits of entropy implied by the full pool, independent of a generated value. */
export function poolEntropy(options: GeneratorOptions): number {
  return Math.floor((options.length ?? 20) * Math.log2(buildPool(options).length || 1))
}

export type StrengthLabel = 'Compromis' | 'Faible' | 'Moyen' | 'Fort'

export interface StrengthGrade {
  label: StrengthLabel
  /** Bar / dot background colour. */
  bar: string
  /** Text colour. */
  text: string
}

const WEAK: StrengthGrade = { label: 'Faible', bar: 'bg-red-600', text: 'text-red-600' }
const MEDIUM: StrengthGrade = { label: 'Moyen', bar: 'bg-amber-600', text: 'text-amber-600' }
const STRONG: StrengthGrade = { label: 'Fort', bar: 'bg-emerald-600', text: 'text-emerald-600' }

export const STRENGTH_THRESHOLDS = { medium: 50, strong: 80 } as const

/** A breached password is always "Compromis", whatever its length. */
export function grade(bits: number, isPwned = false): StrengthGrade & { compromised: boolean } {
  if (isPwned) return { label: 'Compromis', bar: 'bg-red-600', text: 'text-red-600', compromised: true }
  if (bits >= STRENGTH_THRESHOLDS.strong) return { ...STRONG, compromised: false }
  if (bits >= STRENGTH_THRESHOLDS.medium) return { ...MEDIUM, compromised: false }
  return { ...WEAK, compromised: false }
}

const UINT32_RANGE = 0x1_0000_0000 // 2^32
const scratch = new Uint32Array(1)

/**
 * Uniform integer in [0, bound) using rejection sampling.
 *
 * `value % bound` alone would favour the low end of the pool by up to
 * 1 part in 2^32; discarding the incomplete final block removes that bias.
 *
 * The draw is rejected while it lands at or above `limit` — that is the
 * incomplete tail, at most `bound - 1` values wide. Rejecting the other way
 * round would keep redrawing until a value >= limit turns up, which for a
 * typical 87-character pool means a probability of about 16/2^32 per attempt,
 * i.e. an effective hang.
 */
function randomIntBelow(bound: number): number {
  if (!Number.isInteger(bound) || bound <= 0 || bound > UINT32_RANGE) {
    throw new RangeError('bound must be a positive integer no greater than 2^32')
  }
  const limit = Math.floor(UINT32_RANGE / bound) * bound
  let value = 0
  // For bound === 1, limit === 2^32 and no draw is ever rejected.
  do {
    crypto.getRandomValues(scratch)
    value = scratch[0] as number
  } while (value >= limit)
  return value % bound
}

export function generatePassword(options: GeneratorOptions = {}): string {
  const opts: Required<GeneratorOptions> = {
    length: 20,
    upper: true,
    lower: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: false,
    ...options,
  }
  const pool = buildPool(opts)
  if (!pool) throw new Error('at least one character class must be enabled')
  const length = Math.max(1, Math.min(256, opts.length))
  let out = ''
  for (let i = 0; i < length; i++) out += pool.charAt(randomIntBelow(pool.length))
  return out
}

/** Default used by "generate and store" affordances (20 chars, all classes). */
export const generateStrongPassword = (): string => generatePassword()