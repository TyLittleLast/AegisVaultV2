import { describe, expect, it } from 'vitest'
import { displayUrl, getDomain, safeExternalUrl } from './url'

describe('safeExternalUrl', () => {
  it('accepte http et https', () => {
    expect(safeExternalUrl('https://github.com')).toBe('https://github.com/')
    expect(safeExternalUrl('http://example.com/a/b')).toBe('http://example.com/a/b')
  })

  it("ajoute https:// quand le schéma est absent", () => {
    expect(safeExternalUrl('github.com')).toBe('https://github.com/')
    expect(safeExternalUrl('example.com/login?next=1')).toBe('https://example.com/login?next=1')
  })

  it('refuse les schémas dangereux', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/uuid',
      'ftp://example.com',
      'chrome://settings',
      'about:blank',
    ]) {
      expect(safeExternalUrl(hostile)).toBeNull()
    }
  })

  it("résiste à la variante javascript:// contournant includes('://')", () => {
    // `includes('://')` is true here, so a naive check would let it through.
    expect('javascript://%0aalert(1)'.includes('://')).toBe(true)
    expect(safeExternalUrl('javascript://%0aalert(1)')).toBeNull()
  })

  it('refuse les espaces, tabulations et retours à la ligne en tête', () => {
    for (const hostile of [
      '  javascript:alert(1)',
      '\tjavascript:alert(1)',
      '\njavascript:alert(1)',
      'java\tscript:alert(1)',
    ]) {
      expect(safeExternalUrl(hostile)).toBeNull()
    }
  })

  it('refuse une chaîne vide ou absente', () => {
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl(undefined)).toBeNull()
    expect(safeExternalUrl(null)).toBeNull()
  })

  it('refuse une entrée qui ne se laisse pas parser', () => {
    expect(safeExternalUrl('https://')).toBeNull()
    expect(safeExternalUrl('http://[malformed')).toBeNull()
  })

  it('préserve le chemin, la requête et la gonna', () => {
    expect(safeExternalUrl('https://example.com/a/b?c=d#frag')).toBe(
      'https://example.com/a/b?c=d#frag',
    )
    expect(safeExternalUrl('example.com')).toBe('https://example.com/')
  })
})

describe('getDomain', () => {
  it('extrait le nom de domaine sans www', () => {
    expect(getDomain('https://www.github.com/login')).toBe('github.com')
    expect(getDomain('github.com')).toBe('github.com')
    expect(getDomain('https://sub.example.co.uk/x')).toBe('sub.example.co.uk')
  })

  it('renvoie null pour une URL inutilisable', () => {
    expect(getDomain('javascript:alert(1)')).toBeNull()
    expect(getDomain('')).toBeNull()
    expect(getDomain(undefined)).toBeNull()
    expect(getDomain(null)).toBeNull()
  })
})

describe('displayUrl', () => {
  it('retire le schéma et les barres obliques finales', () => {
    expect(displayUrl('https://github.com/login/')).toBe('github.com/login')
    expect(displayUrl('http://example.com')).toBe('example.com')
    expect(displayUrl('HTTPS://Example.com///')).toBe('Example.com')
  })

  it("renvoie une chaîne vide pour une entrée vide", () => {
    expect(displayUrl('')).toBe('')
    expect(displayUrl(undefined)).toBe('')
    expect(displayUrl(null)).toBe('')
  })

  it('laisse intact un texte non-URL', () => {
    expect(displayUrl('github.com')).toBe('github.com')
  })
})