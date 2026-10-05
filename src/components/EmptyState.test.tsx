import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EmptyState from './EmptyState'

afterEach(cleanup)

function illustrationMarkup(): string {
  return document.body.querySelector('svg')!.innerHTML
}

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(
      <EmptyState variant="vault" title="Votre coffre est vide" description="Commencez ici." />,
    )

    expect(screen.getByText('Votre coffre est vide')).toBeTruthy()
    expect(screen.getByText('Commencez ici.')).toBeTruthy()
  })

  it('omits the action slot when none is given', () => {
    const { container } = render(
      <EmptyState variant="search" title="Aucun résultat" description="Rien trouvé." />,
    )

    expect(container.querySelector('button')).toBeNull()
  })

  it('renders the action when one is given', () => {
    render(
      <EmptyState
        variant="filter"
        title="Rien ici"
        description="Changez de filtre."
        action={<button>Tous les identifiants</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Tous les identifiants' })).toBeTruthy()
  })

  it('draws a different illustration per variant', () => {
    const seen: Record<string, string> = {}
    for (const variant of ['vault', 'search', 'filter'] as const) {
      render(<EmptyState variant={variant} title="t" description="d" />)
      seen[variant] = illustrationMarkup()
      cleanup()
    }

    // Guards against the three illustrations collapsing into one generic glyph.
    expect(seen.vault).not.toBe(seen.search)
    expect(seen.search).not.toBe(seen.filter)
    expect(seen.vault).not.toBe(seen.filter)
  })

  it('keeps the artwork hidden from assistive tech', () => {
    const { container } = render(<EmptyState variant="vault" title="t" description="d" />)
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  })
})
