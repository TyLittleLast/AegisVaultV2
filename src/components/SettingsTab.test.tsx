import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AppSettings, VaultStore } from '../types/vault'
import SettingsTab from './SettingsTab'

const SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  lockOnBlur: true,
  hibpEnabled: false,
}

/** Shape accepted by `isVaultStore`: version, KDF params, salt, canary, entries. */
const STORE: VaultStore = {
  v: 2,
  kdf: { algo: 'argon2id', m: 65536, t: 3, p: 1, dkLen: 32 },
  salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
  canary: { iv: 'aXY=', ciphertext: 'Y2FuYXJ5' },
  entries: [],
}

/** 17 characters across all four classes: far above the 50-bit threshold. */
const STRONG = 'aB3$xY9!qW2#zR7%'

interface Harness {
  onSettingsChange: Mock<(settings: AppSettings) => void>
  onChangeMasterPassword: Mock<(current: string, next: string) => Promise<void>>
  onReset: Mock<() => void>
  onImport: Mock<(store: VaultStore) => void>
  container: HTMLElement
}

function renderSettings(
  overrides: Partial<Harness> = {},
  settings: AppSettings = SETTINGS,
  vault: VaultStore | null = STORE,
): Harness {
  const harness: Harness = {
    onSettingsChange: vi.fn<(settings: AppSettings) => void>(),
    onChangeMasterPassword: vi.fn<(current: string, next: string) => Promise<void>>(async () => {}),
    onReset: vi.fn<() => void>(),
    onImport: vi.fn<(store: VaultStore) => void>(),
    container: document.body,
    ...overrides,
  }

  const { container } = render(
    <SettingsTab
      settings={settings}
      vault={vault}
      onSettingsChange={harness.onSettingsChange}
      onChangeMasterPassword={harness.onChangeMasterPassword}
      onReset={harness.onReset}
      onImport={harness.onImport}
    />,
  )

  harness.container = container
  return harness
}

function jsonFile(content: string): File {
  return new File([content], 'coffre.json', { type: 'application/json' })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettingsTab — verrouillage', () => {
  it('applies the chosen idle delay', () => {
    const { onSettingsChange } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: '15 min' }))

    expect(onSettingsChange).toHaveBeenCalledWith({ ...SETTINGS, autoLockMinutes: 15 })
  })

  it('merges a single setting rather than replacing the object', () => {
    const { onSettingsChange } = renderSettings(
      { onSettingsChange: vi.fn<(settings: AppSettings) => void>() },
      { ...SETTINGS, lastExportAt: 1700000000000 },
    )

    fireEvent.click(screen.getByRole('button', { name: '30 min' }))

    expect(onSettingsChange).toHaveBeenCalledWith({
      autoLockMinutes: 30,
      lockOnBlur: true,
      hibpEnabled: false,
      lastExportAt: 1700000000000,
    })
  })

  it('toggles lock-on-blur', () => {
    const { onSettingsChange } = renderSettings()

    fireEvent.click(screen.getByLabelText(/Verrouiller dès que la fenêtre perd le focus/))

    expect(onSettingsChange).toHaveBeenCalledWith({ ...SETTINGS, lockOnBlur: false })
  })
})

describe('SettingsTab — réseau', () => {
  it('keeps breach checking off until it is explicitly enabled', () => {
    const { onSettingsChange } = renderSettings()

    expect(screen.getByLabelText(/Vérifier les mots de passe contre les fuites/)).toHaveProperty(
      'checked',
      false,
    )

    fireEvent.click(screen.getByLabelText(/Vérifier les mots de passe contre les fuites/))

    expect(onSettingsChange).toHaveBeenCalledWith({ ...SETTINGS, hibpEnabled: true })
  })

  it('states that nothing is loaded from a third party', () => {
    renderSettings()

    expect(screen.getByText(/Aucune police, aucune icône, aucun script/)).toBeTruthy()
  })
})

describe('SettingsTab — sauvegarde', () => {
  it('reports that no backup has ever been exported', () => {
    renderSettings()

    expect(screen.getByText(/Aucune sauvegarde exportée pour l’instant/)).toBeTruthy()
  })

  it('shows the age of the last export once there is one', () => {
    renderSettings({}, { ...SETTINGS, lastExportAt: 1700000000000 })

    expect(screen.getByText(/Dernière sauvegarde exportée le/)).toBeTruthy()
  })

  it('cannot export while there is no vault', () => {
    renderSettings({}, SETTINGS, null)

    expect((screen.getByRole('button', { name: /Exporter/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('records the export so its staleness stays visible', () => {
    const { onSettingsChange } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /Exporter/ }))

    expect(onSettingsChange).toHaveBeenCalledTimes(1)
    const patch = onSettingsChange.mock.calls[0]?.[0] as AppSettings
    expect(typeof patch.lastExportAt).toBe('number')
  })

  it('accepts a valid vault file', async () => {
    const { onImport } = renderSettings()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    await waitFor(async () => {
      fireEvent.change(input, { target: { files: [jsonFile(JSON.stringify(STORE))] } })
    })

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(STORE))
    expect(screen.queryByText(/pas un coffre AegisVault valide/)).toBeNull()
  })

  it('refuses a v1 file instead of importing it silently', async () => {
    const { onImport } = renderSettings()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const legacy = JSON.stringify({ salt: 'x', canary: {}, entries: [] })

    await waitFor(async () => {
      fireEvent.change(input, { target: { files: [jsonFile(legacy)] } })
    })

    await waitFor(() =>
      expect(screen.getByText(/n’est pas un coffre AegisVault valide/)).toBeTruthy(),
    )
    expect(onImport).not.toHaveBeenCalled()
  })

  it('reports an unreadable file without crashing', async () => {
    const { container, ...harness } = renderSettings()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    await waitFor(async () => {
      fireEvent.change(input, { target: { files: [jsonFile('pas du json')] } })
    })

    // The parser's own message surfaces; what matters is that it is shown
    // instead of the component throwing or silently importing nothing.
    await waitFor(() => expect(container.querySelector('.text-red-700')?.textContent).toBeTruthy())
    expect(harness.onImport).not.toHaveBeenCalled()
  })
})

describe('SettingsTab — rotation du mot de passe maître', () => {
  function fillRotation(newPwd: string, confirmPwd: string) {
    fireEvent.change(screen.getByLabelText('Mot de passe maître actuel'), {
      target: { value: 'ancien-mdp' },
    })
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe maître'), {
      target: { value: newPwd },
    })
    fireEvent.change(screen.getByLabelText('Confirmer le nouveau mot de passe maître'), {
      target: { value: confirmPwd },
    })
  }

  it('refuses to submit when the two entries differ', async () => {
    const { onChangeMasterPassword } = renderSettings()
    fillRotation(STRONG, STRONG + 'X')

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe maître' }))

    await waitFor(() =>
      expect(screen.getByText(/Les deux mots de passe ne correspondent pas/)).toBeTruthy(),
    )
    expect(onChangeMasterPassword).not.toHaveBeenCalled()
  })

  it('warns when the new password is below the recommended strength', () => {
    renderSettings()

    fireEvent.change(screen.getByLabelText('Nouveau mot de passe maître'), {
      target: { value: 'aaaa' },
    })

    expect(screen.getByText(/Recommandé : au moins 8 caractères/)).toBeTruthy()
  })

  it('keeps the submit button disabled until the form is valid', () => {
    renderSettings()
    const submit = screen.getByRole('button', {
      name: 'Changer le mot de passe maître',
    }) as HTMLButtonElement

    expect(submit.disabled).toBe(true)

    fillRotation(STRONG, STRONG)

    expect(submit.disabled).toBe(false)
  })

  it('confirms once the vault has been re-encrypted', async () => {
    const { onChangeMasterPassword } = renderSettings()
    fillRotation(STRONG, STRONG)

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe maître' }))

    await waitFor(() => expect(screen.getByText(/Mot de passe maître mis à jour/)).toBeTruthy())
    expect(onChangeMasterPassword).toHaveBeenCalledWith('ancien-mdp', STRONG)
  })

  it('surfaces the reason when the rotation is refused', async () => {
    renderSettings({
      onChangeMasterPassword: vi.fn<(current: string, next: string) => Promise<void>>(async () => {
        throw new Error('Mot de passe actuel incorrect.')
      }),
    })
    fillRotation(STRONG, STRONG)

    fireEvent.click(screen.getByRole('button', { name: 'Changer le mot de passe maître' }))

    await waitFor(() => expect(screen.getByText(/Mot de passe actuel incorrect/)).toBeTruthy())
  })
})

describe('SettingsTab — zone dangereuse', () => {
  it('asks for a second confirmation before resetting', () => {
    const { onReset } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser le coffre/ }))

    expect(screen.getByText(/Cette action est irréversible/)).toBeTruthy()
    expect(onReset).not.toHaveBeenCalled()
  })

  it('resets only after the confirmation', () => {
    const { onReset } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser le coffre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('can be backed out of', () => {
    const { onReset } = renderSettings()

    fireEvent.click(screen.getByRole('button', { name: /Réinitialiser le coffre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByText(/Cette action est irréversible/)).toBeNull()
    expect(onReset).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Réinitialiser le coffre/ })).toBeTruthy()
  })
})
