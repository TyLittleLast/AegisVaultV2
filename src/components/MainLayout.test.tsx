import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, VaultEntry, VaultStore } from '../types/vault'
import MainLayout from './MainLayout'

const SETTINGS: AppSettings = { autoLockMinutes: 15, lockOnBlur: true, hibpEnabled: false }

function entry(id: string, entropy: number, favorite = false): VaultEntry {
  const payload = { iv: 'aXY=', ciphertext: 'Y2lwaGVy' }
  return { id, entropy, favorite, service: payload, username: payload, password: payload }
}

function buildVault(entries: VaultEntry[]): VaultStore {
  return {
    v: 2,
    kdf: { algo: 'argon2id', m: 65_536, t: 3, p: 1, dkLen: 32 },
    salt: 'c2FsdA==',
    canary: { iv: 'aXY=', ciphertext: 'Y2FudHk=' },
    entries,
  }
}

function renderLayout(entries: VaultEntry[]) {
  const searchIndex = Object.fromEntries(
    entries.map((e) => [e.id, { service: `Service ${e.id}`, username: `user-${e.id}` }]),
  )
  const props = {
    vault: buildVault(entries),
    searchIndex,
    settings: SETTINGS,
    onLock: vi.fn(),
    onAddEntry: vi.fn(),
    onDeleteEntry: vi.fn(),
    onFixEntry: vi.fn(),
    onToggleFavorite: vi.fn(),
    onSettingsChange: vi.fn(),
    onChangeMasterPassword: vi.fn(),
    onReset: vi.fn(),
    onImport: vi.fn(),
    onRevealSecrets: vi.fn(),
    onRevealAll: vi.fn(),
    durability: null,
    requestingPersist: false,
    persistOutcome: 'idle' as const,
    onRequestPersist: vi.fn(),
  }
  const utils = render(<MainLayout {...props} />)
  return { ...utils, props }
}

describe('MainLayout vault list', () => {
  it('lists entries with their decrypted service and username', () => {
    renderLayout([entry('a', 100), entry('b', 100)])

    expect(screen.getByText('Service a')).toBeTruthy()
    expect(screen.getByText('user-a')).toBeTruthy()
    expect(screen.getByText('Service b')).toBeTruthy()
  })

  it('counts strong and reviewable passwords in the header', () => {
    renderLayout([entry('a', 100), entry('b', 100), entry('c', 20)])

    expect(screen.getByTitle('Robustes (80 bits ou plus)').textContent).toBe('2/3')
    expect(screen.getByTitle('À renforcer').textContent).toBe('1')
  })

  it('narrows the list to favorites', () => {
    renderLayout([entry('a', 100, true), entry('b', 100)])
    fireEvent.click(screen.getByRole('button', { name: 'Favoris' }))

    expect(screen.getByText('Service a')).toBeTruthy()
    expect(screen.queryByText('Service b')).toBeNull()
  })

  it('narrows the list to weak passwords', () => {
    renderLayout([entry('a', 100), entry('b', 20)])
    fireEvent.click(screen.getByRole('button', { name: 'Faibles' }))

    expect(screen.getByText('Service b')).toBeTruthy()
    expect(screen.queryByText('Service a')).toBeNull()
  })

  it('searches service and username', () => {
    renderLayout([entry('a', 100), entry('b', 100)])
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.change(screen.getByLabelText('Rechercher dans le coffre'), { target: { value: 'b' } })

    expect(screen.getByText('Service b')).toBeTruthy()
    expect(screen.queryByText('Service a')).toBeNull()
  })

  it('opens the collapsed search with Ctrl+K', () => {
    renderLayout([entry('a', 100)])

    // The field stays mounted while collapsed so the unfold can animate; what
    // makes it inert is being hidden from the a11y tree, not being absent.
    const field = () => screen.getByLabelText('Rechercher dans le coffre').closest('div')!
    expect(field().getAttribute('aria-hidden')).toBe('true')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(field().getAttribute('aria-hidden')).toBeNull()
  })
})

describe('MainLayout empty states', () => {
  it('offers to add a first entry in an empty vault', () => {
    renderLayout([])

    expect(screen.getByText('Votre coffre est vide')).toBeTruthy()
    // Exact name, so it does not also match the header's "Ajouter une entrée".
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeTruthy()
  })

  it('offers to clear the query when a search matches nothing', () => {
    renderLayout([entry('a', 100)])
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }))
    fireEvent.change(screen.getByLabelText('Rechercher dans le coffre'), {
      target: { value: 'zzz' },
    })

    expect(screen.getByText('Aucun résultat')).toBeTruthy()
    // The search field carries a clear button of the same name, so scope to the
    // empty state's own container.
    const emptyState = screen.getByText('Aucun résultat').closest('div')!
    fireEvent.click(within(emptyState).getByRole('button', { name: /Effacer la recherche/ }))
    expect(screen.getByText('Service a')).toBeTruthy()
  })

  it('offers to reset the filter when a filter matches nothing', () => {
    renderLayout([entry('a', 100)])
    fireEvent.click(screen.getByRole('button', { name: 'Favoris' }))

    expect(screen.getByText('Rien dans ce filtre')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tous les identifiants' }))
    expect(screen.getByText('Service a')).toBeTruthy()
  })
})

afterEach(cleanup)
