import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copySecret } from '../utils/clipboard'
import GeneratorTab from './GeneratorTab'

vi.mock('../utils/clipboard', () => ({ copySecret: vi.fn() }))

const copySecretMock = vi.mocked(copySecret)

/**
 * The candidate lives in the panel's only monospaced span; the placeholder dash
 * is a nested span of the same element.
 */
let mono: HTMLElement | null = null

function renderTab(props: { onUsePassword?: (pwd: string) => void } = {}) {
  const { container, unmount } = render(<GeneratorTab {...props} />)
  mono = container.querySelector('.font-mono')
  return {
    candidate: () => mono?.textContent ?? '',
    unmount,
  }
}

function toggle(label: string): HTMLElement {
  return screen.getByRole('switch', { name: label })
}

function entropyReadout(): string {
  return screen.getByText(/bits —/).textContent ?? ''
}

function lengthReadout(): string {
  return screen.getByLabelText('Longueur').closest('div')?.textContent ?? ''
}

afterEach(() => {
  cleanup()
  mono = null
  vi.clearAllMocks()
})

describe('GeneratorTab', () => {
  it('shows a 20-character candidate on mount, free of ambiguous characters', () => {
    const { candidate } = renderTab()

    expect(candidate()).toHaveLength(20)
    // excludeAmbiguous is on by default: I, O, l, 0 and 1 are out of the pool.
    expect(candidate()).not.toMatch(/[IOl01]/)
  })

  it('keeps the candidate free of ambiguous characters after a regeneration', () => {
    const { candidate } = renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }))

    expect(candidate()).toHaveLength(20)
    expect(candidate()).not.toMatch(/[IOl01]/)
  })

  it('produces a different candidate on every regeneration', () => {
    const { candidate } = renderTab()
    const first = candidate()

    fireEvent.click(screen.getByRole('button', { name: 'Régénérer' }))

    // 20 characters out of a 57-character pool: a repeat is not a real risk.
    expect(candidate()).not.toBe(first)
  })

  it('follows the length slider and regenerates immediately', () => {
    const { candidate } = renderTab()

    fireEvent.change(screen.getByLabelText('Longueur'), { target: { value: '8' } })

    expect(lengthReadout()).toContain('8')
    expect(candidate()).toHaveLength(8)
  })

  it('rates a short candidate as weak and a longer one as strong', () => {
    renderTab()
    const slider = screen.getByLabelText('Longueur')

    // 8 characters over a 57-character pool lands under the 50-bit threshold.
    fireEvent.change(slider, { target: { value: '8' } })
    expect(entropyReadout()).toContain('Faible')

    fireEvent.change(slider, { target: { value: '20' } })
    expect(entropyReadout()).toContain('Fort')
  })

  it('recomputes entropy when a character class is toggled', () => {
    renderTab()
    const before = entropyReadout()

    fireEvent.click(toggle('Symboles'))

    expect(entropyReadout()).not.toBe(before)
    expect(entropyReadout()).toContain('Fort')
  })

  it('reflects the ambiguous-character toggle in the pool size', () => {
    renderTab()
    const before = entropyReadout()

    fireEvent.click(toggle('Exclure les caractères ambigus (I, O, l, 0, 1)'))

    // Allowing I, O, l, 0 and 1 back widens the pool, so the estimate rises.
    expect(entropyReadout()).not.toBe(before)
  })

  it('refuses to generate when every character class is off', () => {
    const { candidate } = renderTab()

    for (const label of ['Majuscules', 'Minuscules', 'Chiffres']) {
      fireEvent.click(toggle(label))
    }

    expect(screen.getByText(/Activez au moins une catégorie/)).toBeTruthy()
    expect(candidate()).toBe('—')
    expect((screen.getByRole('button', { name: 'Régénérer' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: 'Générer' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('copies the visible candidate to the clipboard', () => {
    copySecretMock.mockResolvedValue(true)
    const { candidate } = renderTab()
    const shown = candidate()

    fireEvent.click(screen.getByRole('button', { name: 'Copier le mot de passe' }))

    expect(copySecretMock).toHaveBeenCalledWith(shown)
  })

  it('does not break when the clipboard refuses the write', () => {
    copySecretMock.mockResolvedValue(false)
    renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Copier le mot de passe' }))

    expect(copySecretMock).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copier le mot de passe' })).toBeTruthy()
  })

  it('hides the save affordance when no handler is wired', () => {
    renderTab()

    expect(screen.queryByRole('button', { name: 'Enregistrer dans le coffre' })).toBeNull()
  })

  it('hands the visible candidate to onUsePassword', () => {
    const onUsePassword = vi.fn()
    const { candidate } = renderTab({ onUsePassword })
    const shown = candidate()

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer dans le coffre' }))

    expect(onUsePassword).toHaveBeenCalledWith(shown)
  })

  it('states where the random draw happens', () => {
    renderTab()

    expect(screen.getByText(/crypto\.getRandomValues/)).toBeTruthy()
  })
})
