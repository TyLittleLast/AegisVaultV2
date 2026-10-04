import { useCallback, useEffect, useRef, useState } from 'react'
import { Vault, ArrowRight, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react'
import {
  DEFAULT_KDF,
  clearKey,
  createCanary,
  deriveKey,
  encryptData,
  fromBase64Salt,
  generateSalt,
  toBase64Salt,
  verifyCanary,
} from './services/cryptoService'
import {
  buildSearchIndex,
  decryptEntryPassword,
  decryptEntryUrl,
  encryptEntry,
} from './services/vaultCrypto'
import { diagnoseVault } from './services/vaultSchema'
import {
  DEFAULT_SETTINGS,
  deleteVault,
  loadSettings,
  loadVault,
  saveSettings,
  saveVault,
} from './services/storageService'
import MainLayout from './components/MainLayout'
import { useIsMobile } from './hooks/useIsMobile'
import { entropy, generateStrongPassword } from './utils/password'
import {
  VAULT_FORMAT_VERSION,
  type AppSettings,
  type EntryInput,
  type EntrySearchMeta,
  type VaultEntry,
  type VaultStore,
} from './types/vault'

type Screen = 'loading' | 'setup' | 'login' | 'unlocked' | 'legacy' | 'corrupt'

const fieldShell =
  'rounded-xl bg-white px-[15px] py-[13px] shadow-sm transition-shadow duration-150 focus-within:shadow-md'
const fieldInput =
  'w-full border-0 bg-transparent text-[15px] text-inktext outline-none placeholder:text-inktext-faint'

function FeaturePill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1 text-xs text-inktext-muted shadow-sm">
      <ShieldCheck size={11} className="text-ink" />
      {text}
    </span>
  )
}

function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  const bits = entropy(password)
  const pct = Math.min((bits / 128) * 100, 100)
  const color = bits < 50 ? 'text-red-600' : bits < 80 ? 'text-amber-600' : 'text-emerald-600'
  const bar = bits < 50 ? 'bg-red-600' : bits < 80 ? 'bg-amber-600' : 'bg-emerald-600'
  const label = bits < 50 ? 'Faible' : bits < 80 ? 'Moyen' : 'Fort'
  return (
    <div className="mt-2">
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-[width] duration-[350ms] ease-[cubic-bezier(.16,1,.3,1)] ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1.5 text-[11.5px] font-medium ${color}`}>
        {label} — {bits} bits
      </p>
    </div>
  )
}

function LoginScreen({
  onLogin,
  onSetup,
  isSetup,
  isMobile,
}: {
  onLogin: (pwd: string) => Promise<void>
  onSetup: (pwd: string) => Promise<void>
  isSetup: boolean
  isMobile: boolean
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Minimum 8 caractères requis.')
      return
    }
    if (isSetup && password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      if (isSetup) await onSetup(password)
      else await onLogin(password)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Mot de passe incorrect.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-cream font-sans text-inktext">
      {!isMobile && (
        <div className="relative flex w-[38%] shrink-0 flex-col justify-between px-12 py-[52px]">
          <div className="relative z-[1] flex items-center gap-2.5">
            <Vault size={20} strokeWidth={1.75} className="text-ink" />
            <span className="text-[15px] font-semibold tracking-[-0.03em]">AegisVault</span>
          </div>

          <div className="relative z-[1]">
            <p className="mb-4 max-w-[320px] text-[30px] font-semibold leading-snug tracking-[-0.04em] text-inktext">
              Un seul mot de passe.
              <br />
              Un coffre qui ne quitte jamais votre appareil.
            </p>
            <p className="mb-7 text-sm leading-[1.7] text-inktext-muted">
              Aucun serveur, aucun compte, aucune télémétrie.
              <br />
              Tout est chiffré localement, avant d&apos;être stocké.
            </p>
            <div className="flex flex-wrap gap-2">
              <FeaturePill text="Argon2id" />
              <FeaturePill text="AES-256-GCM" />
              <FeaturePill text="Web Crypto" />
            </div>
          </div>

          <div className="relative z-[1] flex gap-6">
            {[
              { value: '0', label: 'serveur' },
              { value: '0', label: 'compte requis' },
              { value: '0', label: 'requête réseau' },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-[22px] font-semibold tracking-[-0.5px] text-inktext">
                  {value}
                </div>
                <div className="mt-0.5 text-xs text-inktext-faint">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`flex flex-1 items-center justify-center ${isMobile ? 'px-6 py-10' : 'p-12'}`}>
        <div className="w-full max-w-[360px] animate-rise">
          {isMobile && (
            <div className="mb-11 flex items-center gap-2.5">
              <Vault size={20} strokeWidth={1.75} className="text-ink" />
              <span className="text-[15px] font-semibold tracking-[-0.03em]">AegisVault</span>
            </div>
          )}

          <div className="mb-8">
            <h1 className="mb-2 text-2xl font-semibold tracking-[-0.04em] text-inktext">
              {isSetup ? 'Créer votre coffre' : 'Déverrouiller'}
            </h1>
            <p className="m-0 text-[14.5px] leading-relaxed text-inktext-muted">
              {isSetup
                ? 'Choisissez un mot de passe maître. Il ne peut pas être récupéré.'
                : 'Entrez votre mot de passe maître pour déchiffrer le coffre.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-inktext-muted">
                Mot de passe maître
              </span>
              <div className={`${fieldShell} flex items-center gap-2.5`}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoFocus
                  autoComplete={isSetup ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={fieldInput}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="flex shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-inktext-faint"
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {isSetup && <StrengthBar password={password} />}
            </label>

            {isSetup && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-inktext-muted">
                  Confirmer le mot de passe
                </span>
                <div className={fieldShell}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Répétez votre mot de passe"
                    className={fieldInput}
                  />
                </div>
              </label>
            )}

            {error && (
              <div className="rounded-xl bg-white px-3.5 py-2.5 text-[13.5px] leading-normal text-red-600 shadow-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-ink-deep disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? (
                <span className="opacity-70">Déchiffrement…</span>
              ) : (
                <>
                  {isSetup ? 'Créer le coffre' : 'Déverrouiller'} <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {isSetup && (
            <p className="mt-6 text-center text-[12.5px] leading-relaxed text-inktext-faint">
              Si vous oubliez ce mot de passe, le coffre est
              <span className="font-semibold text-inktext-muted"> irrécupérable</span>. C&apos;est
              le prix d&apos;un coffre sans serveur.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Shown when a stored vault cannot be opened by this build — either an older
 * format whose plaintext fields are gone, or structurally invalid data.
 * We refuse rather than attempt a silent migration.
 */
function BlockedVaultScreen({
  title,
  detail,
  onReset,
}: {
  title: string
  detail: string
  onReset: () => void
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 font-sans">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-sm">
        <div className="mb-4 flex items-center gap-2.5 text-ink">
          <AlertTriangle size={20} strokeWidth={1.75} />
          <h1 className="text-[17px] font-semibold tracking-[-0.03em]">{title}</h1>
        </div>
        <p className="mb-6 text-[14px] leading-relaxed text-inktext-muted">{detail}</p>
        <button
          onClick={onReset}
          className="inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-deep"
        >
          Réinitialiser le coffre
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const keyRef = useRef<CryptoKey | null>(null)
  const autoLockRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  const [screen, setScreen] = useState<Screen>('loading')
  const [vault, setVault] = useState<VaultStore | null>(null)
  const [searchIndex, setSearchIndex] = useState<Record<string, EntrySearchMeta>>({})
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    void (async () => {
      const [raw, loadedSettings] = await Promise.all([loadVault(), loadSettings()])
      setSettings(loadedSettings)
      const diagnosis = diagnoseVault(raw)
      if (diagnosis.kind === 'empty') setScreen('setup')
      else if (diagnosis.kind === 'legacy') setScreen('legacy')
      else if (diagnosis.kind === 'corrupt') setScreen('corrupt')
      else setScreen('login')
    })()
  }, [])

  const resetAutoLock = useCallback((minutes: number) => {
    if (autoLockRef.current) clearTimeout(autoLockRef.current)
    autoLockRef.current = setTimeout(() => lock(), minutes * 60_000)
  }, [])

  const lock = useCallback(() => {
    clearKey(keyRef)
    setVault(null)
    setSearchIndex({})
    setScreen('login')
    if (autoLockRef.current) clearTimeout(autoLockRef.current)
  }, [])

  const persist = useCallback(async (next: VaultStore) => {
    await saveVault(next)
    setVault(next)
  }, [])

  const handleSetup = useCallback(
    async (masterPwd: string) => {
      const kdf = DEFAULT_KDF
      const salt = generateSalt()
      const key = await deriveKey(masterPwd, salt, kdf)
      const canary = await createCanary(key)
      const fresh: VaultStore = {
        v: VAULT_FORMAT_VERSION,
        kdf,
        salt: toBase64Salt(salt),
        canary,
        entries: [],
      }
      await saveVault(fresh)
      keyRef.current = key
      setVault(fresh)
      setSearchIndex({})
      resetAutoLock(settings.autoLockMinutes)
      setScreen('unlocked')
    },
    [resetAutoLock, settings.autoLockMinutes],
  )

  const handleLogin = useCallback(
    async (masterPwd: string) => {
      const diagnosis = diagnoseVault(await loadVault())
      if (diagnosis.kind === 'empty') {
        setScreen('setup')
        return
      }
      if (diagnosis.kind !== 'current') {
        setScreen(diagnosis.kind === 'legacy' ? 'legacy' : 'corrupt')
        return
      }
      const stored = diagnosis.store
      const key = await deriveKey(masterPwd, fromBase64Salt(stored.salt), stored.kdf)
      if (!(await verifyCanary(stored.canary, key))) {
        throw new Error('Mot de passe incorrect.')
      }
      keyRef.current = key
      setVault(stored)
      setSearchIndex(await buildSearchIndex(stored.entries, key))
      resetAutoLock(settings.autoLockMinutes)
      setScreen('unlocked')
    },
    [resetAutoLock, settings.autoLockMinutes],
  )

  const handleAddEntry = useCallback(
    async (input: EntryInput) => {
      const key = keyRef.current
      if (!key || !vault) return
      const entry = await encryptEntry(input, key)
      await persist({ ...vault, entries: [...vault.entries, entry] })
      setSearchIndex((prev) => ({
        ...prev,
        [entry.id]: { service: input.service, username: input.username },
      }))
    },
    [persist, vault],
  )

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      if (!vault) return
      await persist({ ...vault, entries: vault.entries.filter((e) => e.id !== id) })
      setSearchIndex((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
    [persist, vault],
  )

  /** Replaces a compromised password with a freshly generated one. */
  const handleFixEntry = useCallback(
    async (entryId: string) => {
      const key = keyRef.current
      if (!key || !vault) return
      const replacement = generateStrongPassword()
      const entries = await Promise.all(
        vault.entries.map(async (e): Promise<VaultEntry> => {
          if (e.id !== entryId) return e
          return {
            ...e,
            password: await encryptData(replacement, key),
            entropy: entropy(replacement),
            updatedAt: new Date().toISOString(),
          }
        }),
      )
      await persist({ ...vault, entries })
    },
    [persist, vault],
  )

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      if (!vault) return
      const entries = vault.entries.map((e) =>
        e.id === id ? { ...e, favorite: !e.favorite } : e,
      )
      await persist({ ...vault, entries })
    },
    [persist, vault],
  )

  const handleSettingsChange = useCallback(async (next: AppSettings) => {
    setSettings(next)
    await saveSettings(next)
    resetAutoLock(next.autoLockMinutes)
  }, [resetAutoLock])

  const handleReset = useCallback(async () => {
    if (autoLockRef.current) clearTimeout(autoLockRef.current)
    clearKey(keyRef)
    await deleteVault()
    setVault(null)
    setSearchIndex({})
    setScreen('setup')
  }, [])

  const handleImport = useCallback(async (imported: VaultStore) => {
    await saveVault(imported)
    clearKey(keyRef)
    setVault(null)
    setSearchIndex({})
    setScreen('login')
  }, [])

  /** Decrypts one entry's secrets on demand, for the entry actually opened. */
  const revealSecrets = useCallback(
    async (entryId: string): Promise<{ password: string; url: string }> => {
      const key = keyRef.current
      const entry = vault?.entries.find((e) => e.id === entryId)
      if (!key || !entry) throw new Error('Coffre verrouillé.')
      const [password, url] = await Promise.all([
        decryptEntryPassword(entry, key),
        decryptEntryUrl(entry, key),
      ])
      return { password, url }
    },
    [vault],
  )

  /**
   * Bulk reveal used by the explicit audit action. The caller must discard the
   * result once the audit completes — this is the only path that decrypts every
   * password at once, and it only runs on deliberate user intent.
   */
  const revealAllForAudit = useCallback(async (): Promise<Record<string, string>> => {
    const key = keyRef.current
    if (!key || !vault) throw new Error('Coffre verrouillé.')
    const pairs = await Promise.all(
      vault.entries.map(async (e) => {
        try {
          return [e.id, await decryptEntryPassword(e, key)] as const
        } catch {
          return [e.id, ''] as const
        }
      }),
    )
    return Object.fromEntries(pairs)
  }, [vault])

  if (screen === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="text-center">
          <div className="mx-auto mb-4 text-ink">
            <Vault size={28} strokeWidth={1.6} />
          </div>
          <div className="mx-auto h-[3px] w-7 overflow-hidden rounded-full bg-border">
            <div className="h-full w-2/5 animate-loading-bar rounded-full bg-ink" />
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'legacy') {
    return (
      <BlockedVaultScreen
        title="Coffre d'un format antérieur"
        detail="Ce coffre a été créé par une version antérieure d'AegisVault, qui ne chiffrait pas les noms de service et les identifiants. Ces champs ne peuvent pas être chiffrés retroactivement, car ils n'ont jamais été stockés chiffrés. Réinitialisez pour repartir avec un coffre au format actuel."
        onReset={handleReset}
      />
    )
  }

  if (screen === 'corrupt') {
    return (
      <BlockedVaultScreen
        title="Coffre illisible"
        detail="Les données stockées ne correspondent à aucun format connu. Elles ont pu être corrompues ou modifiées. Réinitialiser supprimera définitivement ce contenu."
        onReset={handleReset}
      />
    )
  }

  if (screen === 'setup' || screen === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onSetup={handleSetup}
        isSetup={screen === 'setup'}
        isMobile={isMobile}
      />
    )
  }

  return (
    <MainLayout
      vault={vault}
      searchIndex={searchIndex}
      settings={settings}
      onLock={lock}
      onAddEntry={handleAddEntry}
      onDeleteEntry={handleDeleteEntry}
      onFixEntry={handleFixEntry}
      onToggleFavorite={handleToggleFavorite}
      onSettingsChange={handleSettingsChange}
      onReset={handleReset}
      onImport={handleImport}
      onRevealSecrets={revealSecrets}
      onRevealAll={revealAllForAudit}
    />
  )
}