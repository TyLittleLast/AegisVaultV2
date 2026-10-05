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
  reencryptEntry,
} from './services/vaultCrypto'
import { diagnoseVault } from './services/vaultSchema'
import {
  DEFAULT_SETTINGS,
  EMPTY_ATTEMPTS,
  MAX_UNLOCK_FAILURES,
  clearUnlockAttempts,
  deleteVault,
  isLockedOut,
  loadSettings,
  loadUnlockAttempts,
  loadVault,
  recordUnlockFailure,
  saveSettings,
  saveVault,
  readStorageDurability,
  requestPersistentStorage,
  type PersistenceOutcome,
  type StorageDurability,
  type UnlockAttempts,
} from './services/storageService'
import MainLayout from './components/MainLayout'
import { useIdleLock } from './hooks/useIdleLock'
import { useIsMobile } from './hooks/useIsMobile'
import { clearClipboard } from './utils/clipboard'
import {
  entropy,
  generateStrongPassword,
  meetsMinimumMasterPasswordLength,
  MIN_PASSWORD_LENGTH,
} from './utils/password'
import {
  VAULT_FORMAT_VERSION,
  type AppSettings,
  type EntryInput,
  type EntrySearchMeta,
  type VaultEntry,
  type VaultStore,
} from './types/vault'

type Screen = 'loading' | 'setup' | 'login' | 'unlocked' | 'legacy' | 'corrupt'

function formatRemaining(attempts: UnlockAttempts): string {
  if (attempts.lockedUntil === null) return ''
  const seconds = Math.max(1, Math.ceil((attempts.lockedUntil - Date.now()) / 1000))
  if (seconds < 60) return `${seconds} s`
  return `${Math.ceil(seconds / 60)} min`
}

const fieldShell =
  'rounded-xl bg-white px-[15px] py-[13px] shadow-card transition-shadow duration-150 focus-within:shadow-panel'
const fieldInput =
  'w-full border-0 bg-transparent text-[15px] text-inktext outline-none placeholder:text-inktext-faint'

function FeaturePill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1 text-xs text-inktext-muted shadow-card">
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
  lockedUntil,
}: {
  onLogin: (pwd: string) => Promise<void>
  onSetup: (pwd: string) => Promise<void>
  isSetup: boolean
  isMobile: boolean
  lockedUntil: number | null
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // A single tick source. `remaining` is derived rather than stored, so the
  // countdown stays correct without writing state synchronously in an effect.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  const lockedOut = remaining > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (lockedOut) {
      setError(`Déverrouillage temporaire. Réessayez dans ${remaining} s.`)
      return
    }
    // Length is a *creation* rule, not an unlock rule: an existing vault may
    // hold a shorter password, and blocking the submit would make its contents
    // unrecoverable. handleSetup enforces it authoritatively.
    if (isSetup && !meetsMinimumMasterPasswordLength(password)) {
      setError(`Minimum ${MIN_PASSWORD_LENGTH} caractères requis.`)
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

      <div
        className={`flex flex-1 items-center justify-center ${isMobile ? 'px-6 py-10' : 'p-12'}`}
      >
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
              <div className="rounded-xl bg-white px-3.5 py-2.5 text-[13.5px] leading-normal text-red-600 shadow-card">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || lockedOut}
              className="mt-1 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-ink-deep disabled:cursor-not-allowed disabled:opacity-55"
            >
              {loading ? (
                <span className="opacity-70">Déchiffrement…</span>
              ) : lockedOut ? (
                <span className="opacity-70">Verrouillé — {remaining} s</span>
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
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-card">
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
  const isMobile = useIsMobile()

  const [screen, setScreen] = useState<Screen>('loading')
  const [vault, setVault] = useState<VaultStore | null>(null)
  const [searchIndex, setSearchIndex] = useState<Record<string, EntrySearchMeta>>({})
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [attempts, setAttempts] = useState<UnlockAttempts>(EMPTY_ATTEMPTS)
  const [durability, setDurability] = useState<StorageDurability | null>(null)
  const [requestingPersist, setRequestingPersist] = useState(false)
  /**
   * Verdict of the last persist() request. Kept separately from `durability`
   * because a refusal is information the user needs: the button stays visible
   * forever otherwise, and clicking it again changes nothing.
   */
  const [persistOutcome, setPersistOutcome] = useState<PersistenceOutcome>('idle')

  const refreshDurability = useCallback(async () => {
    setDurability(await readStorageDurability())
  }, [])

  const handleRequestPersist = useCallback(async () => {
    setRequestingPersist(true)
    try {
      const granted = await requestPersistentStorage()
      setPersistOutcome(granted ? 'granted' : 'refused')
      await refreshDurability()
    } finally {
      setRequestingPersist(false)
    }
  }, [refreshDurability])

  // Persistence status can change without a reload, once the app is installed
  // or bookmarked. Re-reading on the way back to the tab means the card tells
  // the truth at the moment it is being looked at.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshDurability()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshDurability])

  const lock = useCallback(() => {
    clearKey(keyRef)
    // A copied secret outlives the lock unless the clipboard is wiped too.
    void clearClipboard()
    setVault(null)
    setSearchIndex({})
    setScreen('login')
  }, [])

  useIdleLock({
    enabled: screen === 'unlocked',
    minutes: settings.autoLockMinutes,
    lockOnBlur: settings.lockOnBlur,
    onLock: lock,
  })

  useEffect(() => {
    void (async () => {
      const [raw, loadedSettings] = await Promise.all([loadVault(), loadSettings()])
      setSettings(loadedSettings)
      setAttempts(await loadUnlockAttempts())
      await refreshDurability()
      const diagnosis = diagnoseVault(raw)
      if (diagnosis.kind === 'empty') setScreen('setup')
      else if (diagnosis.kind === 'legacy') setScreen('legacy')
      else if (diagnosis.kind === 'corrupt') setScreen('corrupt')
      else setScreen('login')
    })()
  }, [refreshDurability])

  /**
   * Re-read durability, and ask once, when the vault becomes reachable.
   *
   * Browsers grant persistent storage far more readily to an origin the user
   * has just engaged with than on a cold page load. The outcome is surfaced in
   * the Health tab either way, so this is an attempt, not a silent assumption.
   */
  useEffect(() => {
    if (screen !== 'unlocked') return
    void (async () => {
      const current = await readStorageDurability()
      setDurability(current)
      if (!current.persisted) {
        await handleRequestPersist()
      }
    })()
  }, [screen, refreshDurability, handleRequestPersist])

  const persist = useCallback(async (next: VaultStore) => {
    await saveVault(next)
    setVault(next)
  }, [])

  const handleSetup = useCallback(async (masterPwd: string) => {
    // The single authoritative check for the creation rule. The login screen
    // mirrors it for feedback, but it is not what makes the rule true.
    if (!meetsMinimumMasterPasswordLength(masterPwd)) {
      throw new Error(`Minimum ${MIN_PASSWORD_LENGTH} caractères requis.`)
    }
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
    setScreen('unlocked')
  }, [])

  const handleLogin = useCallback(
    async (masterPwd: string) => {
      if (isLockedOut(attempts)) {
        throw new Error('Trop de tentatives. Patientez avant de réessayer.')
      }
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
        const next = await recordUnlockFailure()
        setAttempts(next)
        throw new Error(
          isLockedOut(next)
            ? `Mot de passe incorrect. Verrouillage temporaire ${formatRemaining(next)}.`
            : `Mot de passe incorrect. ${MAX_UNLOCK_FAILURES - next.failures} tentatives restantes.`,
        )
      }
      await clearUnlockAttempts()
      setAttempts(EMPTY_ATTEMPTS)
      keyRef.current = key
      setVault(stored)
      setSearchIndex(await buildSearchIndex(stored.entries, key))
      setScreen('unlocked')
    },
    [attempts],
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
      const entries = vault.entries.map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e))
      await persist({ ...vault, entries })
    },
    [persist, vault],
  )

  const handleSettingsChange = useCallback(async (next: AppSettings) => {
    setSettings(next)
    await saveSettings(next)
  }, [])

  /**
   * Re-encrypts the entire vault under a new master password.
   *
   * This is the recovery path when a machine may have been compromised: rotate
   * the key, and every stored secret is rewritten under a fresh salt. Without it
   * a vault is permanent once created — there was previously no way to change the
   * master password at all.
   */
  const handleChangeMasterPassword = useCallback(async (currentPwd: string, newPwd: string) => {
    const diagnosis = diagnoseVault(await loadVault())
    if (diagnosis.kind !== 'current') throw new Error('Aucun coffre à ré-chiffrer.')
    if (!meetsMinimumMasterPasswordLength(newPwd))
      throw new Error(
        `Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`,
      )
    if (currentPwd === newPwd) throw new Error('Le nouveau mot de passe doit être différent.')

    const stored = diagnosis.store
    const oldKey = await deriveKey(currentPwd, fromBase64Salt(stored.salt), stored.kdf)
    if (!(await verifyCanary(stored.canary, oldKey))) {
      throw new Error('Mot de passe actuel incorrect.')
    }

    const salt = generateSalt()
    const newKey = await deriveKey(newPwd, salt, stored.kdf)
    const entries = await Promise.all(
      stored.entries.map((entry) => reencryptEntry(entry, oldKey, newKey)),
    )
    const rotated: VaultStore = {
      v: stored.v,
      kdf: stored.kdf,
      salt: toBase64Salt(salt),
      canary: await createCanary(newKey),
      entries,
    }

    await saveVault(rotated)
    clearKey({ current: oldKey })
    keyRef.current = newKey
    setVault(rotated)
    setSearchIndex(await buildSearchIndex(entries, newKey))
  }, [])

  const handleReset = useCallback(async () => {
    clearKey(keyRef)
    await deleteVault()
    await clearUnlockAttempts()
    setAttempts(EMPTY_ATTEMPTS)
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
        lockedUntil={attempts.lockedUntil}
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
      onChangeMasterPassword={handleChangeMasterPassword}
      onReset={handleReset}
      onImport={handleImport}
      onRevealSecrets={revealSecrets}
      onRevealAll={revealAllForAudit}
      durability={durability}
      requestingPersist={requestingPersist}
      persistOutcome={persistOutcome}
      onRequestPersist={() => void handleRequestPersist()}
    />
  )
}
