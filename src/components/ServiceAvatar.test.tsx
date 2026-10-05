import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ServiceAvatar from './ServiceAvatar'

afterEach(cleanup)

describe('ServiceAvatar', () => {
  it('draws the brand mark when the label resolves', () => {
    const { container } = render(<ServiceAvatar label="GitHub" />)

    const svg = container.querySelector('svg')!
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(50)
  })

  it('falls back to a monogram when nothing matches', () => {
    const { container } = render(<ServiceAvatar label="ZzzCorp" />)

    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toBe('ZZ')
  })

  it('takes the initials from the first two words', () => {
    const { container } = render(<ServiceAvatar label="Foo Bar" />)
    expect(container.textContent).toBe('FB')
  })

  it('resolves through a URL-shaped or decorated label', () => {
    for (const label of ['github.com', 'GitHub (perso)', 'RÉVOLUT']) {
      const { container } = render(<ServiceAvatar label={label} />)
      expect(container.querySelector('svg'), label).toBeTruthy()
    }
  })

  it('keeps the tile neutral and the glyph in the brand colour', () => {
    const { container } = render(<ServiceAvatar label="GitHub" />)
    const tile = container.firstElementChild as HTMLElement

    // No inline background colour: a tinted tile read as a stray red wash in
    // the list, which is why the brand colour lives in the path only.
    expect(tile.style.backgroundColor).toBe('')
    expect(tile.className).toContain('bg-ink-light')
    expect(container.querySelector('path')!.getAttribute('fill')).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('honours the requested size and stays decorative', () => {
    const { container } = render(<ServiceAvatar label="GitHub" size={32} />)
    const tile = container.firstElementChild as HTMLElement

    expect(tile.style.width).toBe('32px')
    expect(tile.style.height).toBe('32px')
    expect(tile.getAttribute('aria-hidden')).toBe('true')
  })

  it('gives the same service the same monogram tone every time', () => {
    const first = render(<ServiceAvatar label="ZzzCorp" />).container
      .firstElementChild as HTMLElement
    cleanup()
    const second = render(<ServiceAvatar label="ZzzCorp" />).container
      .firstElementChild as HTMLElement

    expect(second.className).toBe(first.className)
  })
})
