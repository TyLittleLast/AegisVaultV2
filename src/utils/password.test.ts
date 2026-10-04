import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  STRENGTH_THRESHOLDS,
  buildPool,
  entropy,
  generatePassword,
  generateStrongPassword,
  grade,
  poolEntropy,
} from './password'

const ALL = { upper: true, lower: true, digits: true, symbols: true }

describe('buildPool', () => {
  it('inclut chaque classe activée', () => {
    expect(buildPool({ upper: true, lower: false, digits: false, symbols: false })).toBe(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    )
    expect(buildPool({ upper: false, lower: false, digits: true, symbols: false })).toBe(
      '0123456789',
    )
  })

  it('retire les caractères ambigus quand demandé', () => {
    const pool = buildPool({ ...ALL, excludeAmbiguous: true })
    for (const char of ['I', 'O', 'l', '0', '1']) {
      expect(pool).not.toContain(char)
    }
    expect(pool).toContain('A')
    expect(pool).toContain('a')
    expect(pool).toContain('2')
  })

  it('conserve les symboles même en mode non ambigus', () => {
    expect(
      buildPool({
        symbols: true,
        upper: false,
        lower: false,
        digits: false,
        excludeAmbiguous: true,
      }),
    ).toContain('!')
  })

  it('renvoie une chaîne vide si toutes les classes sont désactivées', () => {
    expect(buildPool({ upper: false, lower: false, digits: false, symbols: false })).toBe('')
  })

  it('ne produit aucun caractère dupliqué', () => {
    const pool = buildPool(ALL)
    expect(new Set(pool).size).toBe(pool.length)
  })
})

describe('entropy', () => {
  it('renvoie 0 pour une chaîne vide', () => {
    expect(entropy('')).toBe(0)
  })

  it('croît avec la longueur', () => {
    expect(entropy('aaaa')).toBeLessThan(entropy('aaaaaaaaaaaa'))
  })

  it('croît avec la taille du jeu de caractères', () => {
    const long = 'a'.repeat(20)
    const wide = `${'a'.repeat(10)}${'A'.repeat(10)}`
    expect(entropy(wide)).toBeGreaterThan(entropy(long))
  })

  it('ne dépasse jamais la longueur × log2(jeu)', () => {
    const value = 'aA1!'.repeat(5)
    expect(entropy(value)).toBeLessThanOrEqual(value.length * Math.log2(94))
  })

  it('traite les symboles comme un jeu de 32', () => {
    expect(entropy('!!!!!!!!!!')).toBe(Math.floor(10 * Math.log2(32)))
  })
})

describe('poolEntropy', () => {
  it('reflète la longueur et les classes', () => {
    // Derived from buildPool rather than hardcoded, so the assertion tracks the
    // real pool size (88 for the defaults) instead of a guessed 94.
    const all = buildPool(ALL).length
    const lowerOnly = buildPool({ lower: true, upper: false, digits: false, symbols: false }).length

    expect(all).toBe(88)
    expect(poolEntropy({ length: 20, ...ALL })).toBe(Math.floor(20 * Math.log2(all)))
    expect(poolEntropy({ length: 40, ...ALL })).toBeGreaterThan(poolEntropy({ length: 20, ...ALL }))
    expect(
      poolEntropy({ length: 20, lower: true, upper: false, digits: false, symbols: false }),
    ).toBe(Math.floor(20 * Math.log2(lowerOnly)))
  })

  it('renvoie 0 quand aucune classe n est active', () => {
    expect(poolEntropy({ upper: false, lower: false, digits: false, symbols: false })).toBe(0)
  })

  it('retombe sur 20 caractères par défaut', () => {
    expect(poolEntropy({})).toBe(Math.floor(20 * Math.log2(buildPool(ALL).length)))
  })
})

describe('grade', () => {
  it('classe selon les seuils', () => {
    expect(grade(STRENGTH_THRESHOLDS.strong).label).toBe('Fort')
    expect(grade(STRENGTH_THRESHOLDS.strong - 1).label).toBe('Moyen')
    expect(grade(STRENGTH_THRESHOLDS.medium).label).toBe('Moyen')
    expect(grade(STRENGTH_THRESHOLDS.medium - 1).label).toBe('Faible')
    expect(grade(0).label).toBe('Faible')
  })

  it('classe un mot de passe compromis en Compromis quelle que soit sa force', () => {
    const result = grade(200, true)
    expect(result.label).toBe('Compromis')
    expect(result.compromised).toBe(true)
  })

  it('suit le drapeau compromised quand le mot de passe est sain', () => {
    expect(grade(200, false).compromised).toBe(false)
    expect(grade(0).compromised).toBe(false)
  })

  it('fournit des couleurs pour la barre et le texte', () => {
    for (const bits of [0, 60, 100]) {
      const result = grade(bits)
      expect(result.bar).toMatch(/^bg-/)
      expect(result.text).toMatch(/^text-/)
    }
  })

  it('ne renvoie pas l objet partagé (mutation accidentelle impossible)', () => {
    expect(grade(0)).not.toBe(grade(0))
  })
})

describe('generatePassword', () => {
  it('respecte la longueur demandée', () => {
    for (const length of [1, 8, 20, 64, 256]) {
      expect(generatePassword({ length })).toHaveLength(length)
    }
  })

  it('borne la longueur', () => {
    expect(generatePassword({ length: 0 })).toHaveLength(1)
    expect(generatePassword({ length: -5 })).toHaveLength(1)
    expect(generatePassword({ length: 100_000 })).toHaveLength(256)
  })

  it("n'utilise que les caractères des classes activées", () => {
    expect(
      generatePassword({ length: 200, digits: true, upper: false, lower: false, symbols: false }),
    ).toMatch(/^[0-9]+$/)
    expect(
      generatePassword({ length: 200, symbols: true, upper: false, lower: false, digits: false }),
    ).toMatch(/^[!@#$%^&*()\-_=+[\]{}|;:,.<>?]+$/)
  })

  it('respecte excludeAmbiguous', () => {
    const value = generatePassword({ length: 500, excludeAmbiguous: true })
    for (const char of ['I', 'O', 'l', '0', '1']) expect(value).not.toContain(char)
  })

  it('refuse de générer sans aucune classe', () => {
    expect(() =>
      generatePassword({ upper: false, lower: false, digits: false, symbols: false }),
    ).toThrow()
  })

  it('produit des valeurs distinctes', () => {
    const values = new Set(Array.from({ length: 200 }, () => generatePassword()))
    // Collision-free across 200 draws of 20 chars is a practical certainty; the
    // bound just catches a generator stuck on a constant.
    expect(values.size).toBe(200)
  })

  it('couvre toutes les classes activées sur un grand tirage', () => {
    const value = generatePassword({ length: 500 })
    expect(value).toMatch(/[A-Z]/)
    expect(value).toMatch(/[a-z]/)
    expect(value).toMatch(/[0-9]/)
    expect(value).toMatch(/[^A-Za-z0-9]/)
  })

  it('approximativement uniforme sur le jeu (test de fumée statistique)', () => {
    const pool = buildPool({ lower: true, upper: false, digits: false, symbols: false })
    const counts = new Map<string, number>([...pool].map((c) => [c, 0]))

    // generatePassword caps length at 256, so accumulate over many draws.
    const lowerOnly = { lower: true, upper: false, digits: false, symbols: false }
    let draws = 0
    for (let i = 0; i < 240; i++) {
      for (const char of generatePassword({ length: 256, ...lowerOnly })) {
        counts.set(char, (counts.get(char) ?? 0) + 1)
        draws++
      }
    }

    const expected = draws / pool.length
    // Every character within 20% of the expected count: loose enough to never
    // be flaky, tight enough to catch a modulo-biased generator.
    expect(draws).toBe(240 * 256)
    for (const [char, count] of counts) {
      expect(count, `char ${char}`).toBeGreaterThan(expected * 0.8)
      expect(count, `char ${char}`).toBeLessThan(expected * 1.2)
    }
  })

  it('ne boucle pas indéfiniment sur un grand jeu de caractères', () => {
    // Regression: the rejection-sampling condition was inverted, so draws kept
    // being discarded until a value >= limit appeared — roughly a 16/2^32
    // chance per attempt, which froze the generator.
    const started = Date.now()
    expect(generatePassword({ length: 64 })).toHaveLength(64)
    expect(generateStrongPassword()).toHaveLength(20)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('expose une longueur minimale cohérente', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('generateStrongPassword utilise les valeurs par défaut', () => {
    const value = generateStrongPassword()
    expect(value).toHaveLength(20)
    // Character-set membership, not per-class coverage: a single 20-char draw
    // has roughly a 9% chance of missing the digit class entirely, which would
    // make this test flaky. Class coverage is asserted on a long draw above.
    const pool = new Set(buildPool(ALL))
    for (const char of value) expect(pool.has(char)).toBe(true)
  })
})
