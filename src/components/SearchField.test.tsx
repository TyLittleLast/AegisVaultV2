import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchField from './SearchField'

afterEach(cleanup)

function setup(props: Partial<React.ComponentProps<typeof SearchField>> = {}) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  const utils = render(<SearchField value="" onChange={onChange} onClose={onClose} {...props} />)
  return { onChange, onClose, input: utils.container.querySelector('input')!, ...utils }
}

describe('SearchField', () => {
  it('labels the input explicitly rather than through a wrapping label', () => {
    setup()
    expect(screen.getByLabelText('Rechercher dans le coffre')).toBeTruthy()
  })

  it('reports what the user types', () => {
    const { onChange, input } = setup()
    fireEvent.change(input, { target: { value: 'git' } })
    expect(onChange).toHaveBeenCalledWith('git')
  })

  it('collapses on Escape without clearing the query', () => {
    const { onClose, onChange, input } = setup({ value: 'git' })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('collapses from the leading icon without clearing the query', () => {
    const { onClose, onChange } = setup({ value: 'git' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la recherche' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clears the query from the trailing icon but stays open', () => {
    const { onChange, onClose } = setup({ value: 'git' })
    fireEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }))

    expect(onChange).toHaveBeenCalledWith('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hides the clear control until there is something to clear', () => {
    setup({ value: '' })
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).toBeNull()
  })

  it('stays reachable while open', () => {
    const { container } = setup()
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe('0')
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBeNull()
  })

  it('drops out of the tab order and the a11y tree while collapsed to zero width', () => {
    const { container } = setup({ inactive: true })

    // The field stays mounted so the unfold can animate; without this it would
    // be an invisible focus stop that screen readers still announce.
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe('-1')
    expect(
      container.querySelector('button[aria-label="Fermer la recherche"]')!.getAttribute('tabindex'),
    ).toBe('-1')
  })
})
