import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkPasswordBreach } from '../services/hibpService'
import type { EntrySearchMeta, VaultEntry } from '../types/vault'
import HealthTab from './HealthTab'

vi.mock('../services/hibpService', () => ({ checkPasswordBreach: vi.fn() }))

const BREACHED = 'breached'
const WEAK = 'aaaa'
/** 17 characters across all four classes: far above the 80-bit threshold. */
const STRONG = 'aB3$xY9!qW2#zR7%'

/** `service` is encrypted; the label the UI shows comes from `searchIndex`. */
function entry(id: string): VaultEntry {
  const payload = { iv: 'aXY=', ciphertext: 'Y2lwaGVy' }
  return {
    id,
    service: payload,
    username: payload,
    url: payload,
    password: payload,
    entropy: 0,
  }
}

interface Fixture {
  ids: string[]
  passwords: Record<string, string>
}

function renderHealthTab({ ids, passwords }: Fixture, hibpEnabled = true) {
  const entries = ids.map((id) => entry(id))
  const searchIndex = Object.fromEntries(
    entries.map((e) => [e.id, { service: `Service ${e.id}`, username: 'user' } as EntrySearchMeta]),
  )
  const onFixEntry = vi.fn()

  const utils = render(
    <HealthTab
      entries={entries}
      searchIndex={searchIndex}
      hibpEnabled={hibpEnabled}
      revealAll={async () => passwords}
      onFixEntry={onFixEntry}
      durability={null}
      requestingPersist={false}
      persistOutcome="idle"
      onRequestPersist={vi.fn()}
    />,
  )

  const card = () =>
    screen
      .getByRole('heading', { name: 'Mots de passe à corriger' })
      .closest('section') as HTMLElement

  const runAudit = async () => {
    fireEvent.click(screen.getByRole('button', { name: /Analyser/ }))
    await waitFor(() => expect(within(card()).queryByText(/à traiter/)).toBeTruthy())
  }

  return { ...utils, card, onFixEntry, runAudit }
}

beforeEach(() => {
  vi.mocked(checkPasswordBreach).mockImplementation(async (password: string) =>
    password === BREACHED ? { isPwned: true, count: 42 } : { isPwned: false, count: 0 },
  )
})

afterEach(cleanup)

describe('HealthTab', () => {
  it('asks for an audit before showing any verdict', () => {
    renderHealthTab({ ids: ['a'], passwords: { a: STRONG } })

    expect(screen.getByText(/Lancez l’analyse/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Corriger/ })).toBeNull()
  })

  it('explains an empty vault instead of offering an audit', () => {
    renderHealthTab({ ids: [], passwords: {} })
    expect(screen.getByText(/Le coffre est vide/)).toBeTruthy()
  })

  it('grades a breach above its length', async () => {
    const { card, runAudit } = renderHealthTab({ ids: ['a'], passwords: { a: BREACHED } })
    await runAudit()

    // The same password is also weak on entropy; a breach must win.
    expect(within(card()).getByText('Compromis')).toBeTruthy()
    expect(within(card()).queryByText('Faible')).toBeNull()
  })

  it('reports a low-entropy password as weak', async () => {
    const { card, runAudit } = renderHealthTab({ ids: ['a'], passwords: { a: WEAK } })
    await runAudit()

    expect(within(card()).getByText('Faible')).toBeTruthy()
  })

  it('reports a strong password reused across accounts', async () => {
    const { card, runAudit } = renderHealthTab({
      ids: ['a', 'b'],
      passwords: { a: STRONG, b: STRONG },
    })
    await runAudit()

    expect(within(card()).getAllByText('Réutilisé')).toHaveLength(2)
  })

  it('fixes the right entry from its row', async () => {
    const { card, onFixEntry, runAudit } = renderHealthTab({
      ids: ['a', 'b'],
      passwords: { a: WEAK, b: STRONG },
    })
    await runAudit()

    const fixButtons = within(card()).getAllByRole('button', { name: /Corriger/ })
    expect(fixButtons).toHaveLength(1)

    fireEvent.click(fixButtons[0]!)
    expect(onFixEntry).toHaveBeenCalledWith('a')
  })

  it('celebrates a vault with nothing to fix', async () => {
    const { runAudit } = renderHealthTab({ ids: ['a', 'b'], passwords: { a: STRONG, b: WEAK } })
    await runAudit()
    cleanup()

    const healthy = renderHealthTab({
      ids: ['a', 'b'],
      passwords: { a: STRONG, b: 'Zq7#mR2$vT9@wP4&' },
    })
    await healthy.runAudit()

    expect(
      within(healthy.card()).getByText(/Aucun mot de passe faible, compromis ou réutilisé/),
    ).toBeTruthy()
  })

  it('never queries HIBP while breach checks are opt-out', async () => {
    const { runAudit } = renderHealthTab({ ids: ['a'], passwords: { a: BREACHED } }, false)
    await runAudit()

    expect(checkPasswordBreach).not.toHaveBeenCalled()
  })
})
