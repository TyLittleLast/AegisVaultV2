import { describe, expect, it } from 'vitest'
import { brandTint, resolveBrand } from './brandIcons'
import { BRAND_MARKS } from './brandIcons.generated'

describe('resolveBrand', () => {
  it('matches the plain brand name', () => {
    expect(resolveBrand('GitHub')?.slug).toBe('github')
    expect(resolveBrand('Spotify')?.slug).toBe('spotify')
    expect(resolveBrand('Cloudflare')?.slug).toBe('cloudflare')
  })

  it('matches through a URL-shaped label', () => {
    expect(resolveBrand('github.com')?.slug).toBe('github')
    expect(resolveBrand('https://www.netlify.com/app')?.slug).toBe('netlify')
  })

  it('matches inside a decorated label', () => {
    expect(resolveBrand('GitHub (perso)')?.slug).toBe('github')
    expect(resolveBrand('GitHub — travail')?.slug).toBe('github')
  })

  it('ignores case, accents and punctuation', () => {
    expect(resolveBrand('RÉVOLUT')?.slug).toBe('revolut')
    expect(resolveBrand('DuoDuck')).toBeNull()
    expect(resolveBrand('pinterest.fr')?.slug).toBe('pinterest')
  })

  it('prefers the longest matching alias', () => {
    // "proton mail" must not fall back to the generic Proton brand.
    expect(resolveBrand('Proton Mail')?.slug).toBe('protonmail')
    expect(resolveBrand('Proton')?.slug).toBe('proton')
    expect(resolveBrand('Google Mail')?.slug).toBe('gmail')
  })

  it('matches single-token aliases only as whole tokens', () => {
    expect(resolveBrand('X')?.slug).toBe('x')
    expect(resolveBrand('Twitter')?.slug).toBe('x')
    expect(resolveBrand('Xbox')).toBeNull()
    expect(resolveBrand('Max')).toBeNull()
  })

  it('returns null for an unknown or blank label', () => {
    expect(resolveBrand('ZzzCorp')).toBeNull()
    expect(resolveBrand('')).toBeNull()
    expect(resolveBrand('   ')).toBeNull()
  })

  it('exposes a usable colour and path', () => {
    const brand = resolveBrand('GitHub')
    expect(brand?.color).toMatch(/^#[0-9A-F]{6}$/)
    expect(brand?.viewBox).toBeTruthy()
    expect(brand?.path.length).toBeGreaterThan(50)
  })
})

describe('BRAND_MARKS', () => {
  it('has no empty alias and no duplicate alias', () => {
    const seen = new Set<string>()
    for (const mark of Object.values(BRAND_MARKS)) {
      expect(mark.aliases.length).toBeGreaterThan(0)
      for (const alias of mark.aliases) {
        expect(alias).toBe(alias.trim().toLowerCase())
        expect(seen.has(alias)).toBe(false)
        seen.add(alias)
      }
    }
  })

  it('declares every mark with a hex colour and a path', () => {
    for (const [slug, mark] of Object.entries(BRAND_MARKS)) {
      expect(mark.hex, slug).toMatch(/^[0-9A-F]{6}$/)
      expect(mark.path.length, slug).toBeGreaterThan(0)
    }
  })
})

describe('brandTint', () => {
  it('converts a hex colour to rgba', () => {
    expect(brandTint('#FF0000')).toBe('rgba(255, 0, 0, 0.12)')
    expect(brandTint('#1A73E8', 0.5)).toBe('rgba(26, 115, 232, 0.5)')
  })
})
