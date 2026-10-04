import { useState, useRef, useEffect, useCallback } from 'react'
import { Vault, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import {
  deriveKey, encryptData, decryptData, createCanary, verifyCanary, clearKey,
} from './services/cryptoService'
import { loadVault, saveVault, loadSettings } from './services/storageService'
import MainLayout from './components/MainLayout'
import type { VaultEntry, VaultStore, AppSettings } from './types/vault'

type Screen = 'loading' | 'setup' | 'login' | 'unlocked'

/* ── Mobile hook ─────────────────────────────────────────────────────────── */
export function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])
  return isMobile
}

/* ── Strength helpers ─────────────────────────────────────────────────────── */
function calcEntropy(pwd: string) {
  let pool = 0
  if (/[a-z]/.test(pwd)) pool += 26
  if (/[A-Z]/.test(pwd)) pool += 26
  if (/[0-9]/.test(pwd)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 32
  return pool > 0 ? Math.floor(pwd.length * Math.log2(pool)) : 0
}

function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  const e = calcEntropy(password)
  const pct = Math.min((e / 100) * 100, 100)
  const isWeak = e < 50
  const isMid = e >= 50 && e < 80
  const color = isWeak ? 'text-red-600' : isMid ? 'text-amber-600' : 'text-green-600'
  const bar = isWeak ? 'bg-red-600' : isMid ? 'bg-amber-600' : 'bg-green-600'
  const label = isWeak ? 'Faible' : isMid ? 'Moyen' : 'Fort'
  return (
    <div className="mt-2">
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-[width] duration-[350ms] ease-[cubic-bezier(.16,1,.3,1)] ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1.5 text-[11.5px] font-medium ${color}`}>{label} — {e} bits</p>
    </div>
  )
}

/* ── Feature pill ────────────────────────────────────────────────────────── */
function FeaturePill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1 text-xs text-inktext-muted shadow-sm">
      <ShieldCheck size={11} className="text-ink" />
      {text}
    </span>
  )
}

const fieldShell = 'rounded-xl bg-white px-[15px] py-[13px] shadow-sm transition-shadow duration-150 focus-within:shadow-md'
const fieldInput = 'w-full border-0 bg-transparent text-[15px] text-inktext outline-none placeholder:text-inktext-faint'

/* ── Login screen ────────────────────────────────────────────────────────── */
function LoginScreen({
  onLogin,
  onSetup,
  entryCount,
  isMobile,
}: {
  onLogin: (pwd: string) => Promise<void>
  onSetup: (pwd: string) => Promise<void>
  entryCount: number | null  // null = setup mode
  isMobile: boolean
}) {
  const isSetup = entryCount === null
  const [step, setStep] = useState<'email' | 'password'>(isSetup ? 'password' : 'email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!isSetup && step === 'email') { setStep('password'); return }
    if (password.length < 8) { setError('Minimum 8 caractères requis.'); return }
    if (isSetup && password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return }
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

      {/* ── Panneau illustration (desktop) ── */}
      {!isMobile && (
        <div className="relative flex w-[38%] shrink-0 flex-col justify-between px-12 py-[52px]">
          <div className="relative z-[1] flex items-center gap-2.5">
            <Vault size={20} strokeWidth={1.75} className="text-ink" />
            <span className="text-[15px] font-semibold tracking-[-0.03em]">AegisVault</span>
          </div>

          <div className="relative z-[1]">
            <p className="mb-4 max-w-[320px] text-[30px] font-semibold leading-snug tracking-[-0.04em] text-inktext">
              Un seul mot de passe.<br />Une sécurité totale.
            </p>
            <p className="mb-7 text-sm leading-[1.7] text-inktext-muted">
              Vos identifiants chiffrés localement,<br />jamais partagés, toujours disponibles.
            </p>
            <div className="flex flex-wrap gap-2">
              <FeaturePill text="Argon2id" />
              <FeaturePill text="AES-256" />
              <FeaturePill text="k-anonymat HIBP" />
            </div>
          </div>

          <div className="relative z-[1] flex gap-8">
            {[
              { value: String(entryCount ?? 0), label: 'identifiants' },
              { value: '0', label: 'fuite de données' },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-[22px] font-semibold tracking-[-0.5px] text-inktext">{value}</div>
                <div className="mt-0.5 text-xs text-inktext-faint">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Formulaire ── */}
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
              {isSetup ? 'Créer votre coffre' : step === 'email' ? 'Bon retour !' : 'Mot de passe maître'}
            </h1>
            <p className="m-0 text-[14.5px] leading-relaxed text-inktext-muted">
              {isSetup
                ? 'Choisissez un mot de passe maître fort pour protéger vos accès.'
                : step === 'email'
                  ? 'Connectez-vous à votre coffre sécurisé.'
                  : email || 'Entrez votre mot de passe maître pour déverrouiller.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">

            {!isSetup && step === 'email' && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold tracking-[0.02em] text-inktext-muted">
                  Adresse e-mail
                </span>
                <div className={fieldShell}>
                  <input
                    type="email"
                    autoFocus
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="vous@exemple.fr"
                    className={fieldInput}
                  />
                </div>
              </label>
            )}

            {(isSetup || step === 'password') && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-inktext-muted">
                  Mot de passe maître
                </span>
                <div className={`${fieldShell} flex items-center gap-2.5`}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    autoFocus
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={fieldInput}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(s => !s)}
                    className="flex shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-inktext-faint"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {isSetup && <StrengthBar password={password} />}
              </label>
            )}

            {isSetup && (
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-inktext-muted">
                  Confirmer le mot de passe
                </span>
                <div className={fieldShell}>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Répétez votre mot de passe"
                    className={fieldInput}
                  />
                </div>
              </label>
            )}

            {!isSetup && step === 'password' && (
              <div className="text-right">
                <span className="cursor-pointer text-[13px] text-inktext-faint">
                  Mot de passe oublié ?
                </span>
              </div>
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
              {loading
                ? <span className="opacity-70">Chargement…</span>
                : <>{isSetup ? 'Créer le coffre' : step === 'email' ? 'Continuer' : 'Déverrouiller'} <ArrowRight size={16} /></>
              }
            </button>

          </form>

          <p className="mt-8 text-center text-[13px] text-inktext-faint">
            {isSetup
              ? <>Déjà un coffre ? <span className="cursor-pointer font-semibold text-ink" onClick={() => window.location.reload()}>Se connecter</span></>
              : <>Nouveau ? <span className="cursor-pointer font-semibold text-ink">Créer un compte</span></>
            }
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── App root ────────────────────────────────────────────────────────────── */
export default function App() {
  const keyRef = useRef<CryptoKey | null>(null)
  const autoLockRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useIsMobile()

  const [screen, setScreen] = useState<Screen>('loading')
  const [vault, setVault] = useState<VaultStore | null>(null)
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState<AppSettings>({ autoLockMinutes: 5 })

  useEffect(() => {
    Promise.all([loadVault(), loadSettings()]).then(([v, s]) => {
      setSettings(s)
      if (v) { setVault(v); setScreen('login') }
      else setScreen('setup')
    })
  }, [])

  const lock = useCallback(() => {
    clearKey(keyRef)
    setDecryptedPasswords({})
    setEntries([])
    setScreen('login')
    if (autoLockRef.current) clearTimeout(autoLockRef.current)
  }, [])

  const resetAutoLock = useCallback((minutes: number) => {
    if (autoLockRef.current) clearTimeout(autoLockRef.current)
    autoLockRef.current = setTimeout(lock, minutes * 60_000)
  }, [lock])

  const decryptAll = useCallback(async (vaultEntries: VaultEntry[], key: CryptoKey) => {
    const out: Record<string, string> = {}
    for (const e of vaultEntries) {
      try { out[e.id] = await decryptData(e.encrypted, key) }
      catch { out[e.id] = '' }
    }
    setDecryptedPasswords(out)
  }, [])

  const handleSetup = async (masterPwd: string) => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(masterPwd, salt)
    const canary = await createCanary(key)
    const newVault: VaultStore = {
      salt: btoa(String.fromCharCode(...salt)),
      canary,
      entries: [],
    }
    await saveVault(newVault)
    keyRef.current = key
    setVault(newVault)
    setEntries([])
    setDecryptedPasswords({})
    resetAutoLock(settings.autoLockMinutes)
    setScreen('unlocked')
  }

  const handleLogin = async (masterPwd: string) => {
    const stored = await loadVault()
    if (!stored) { setScreen('setup'); return }
    const salt = Uint8Array.from(atob(stored.salt), c => c.charCodeAt(0))
    const key = await deriveKey(masterPwd, salt)
    const valid = await verifyCanary(stored.canary, key)
    if (!valid) throw new Error('Mot de passe incorrect.')
    keyRef.current = key
    setVault(stored)
    setEntries(stored.entries)
    await decryptAll(stored.entries, key)
    resetAutoLock(settings.autoLockMinutes)
    setScreen('unlocked')
  }

  const handleAddEntry = async (data: { service: string; url: string; username: string; password: string }) => {
    if (!keyRef.current || !vault) return
    const encrypted = await encryptData(data.password, keyRef.current)
    const entry: VaultEntry = {
      id: crypto.randomUUID(),
      service: data.service,
      url: data.url,
      username: data.username,
      encrypted,
      updatedAt: new Date().toISOString(),
    }
    const updatedEntries = [...entries, entry]
    const updatedVault = { ...vault, entries: updatedEntries }
    await saveVault(updatedVault)
    setVault(updatedVault)
    setEntries(updatedEntries)
    setDecryptedPasswords(p => ({ ...p, [entry.id]: data.password }))
  }

  const handleDeleteEntry = async (id: string) => {
    if (!vault) return
    const updatedEntries = entries.filter(e => e.id !== id)
    const updatedVault = { ...vault, entries: updatedEntries }
    await saveVault(updatedVault)
    setVault(updatedVault)
    setEntries(updatedEntries)
    setDecryptedPasswords(p => { const n = { ...p }; delete n[id]; return n })
  }

  const handleFixEntry = async (entryId: string, newPassword: string) => {
    if (!keyRef.current || !vault) return
    const encrypted = await encryptData(newPassword, keyRef.current)
    const updatedEntries = entries.map(e =>
      e.id === entryId ? { ...e, encrypted, updatedAt: new Date().toISOString() } : e,
    )
    const updatedVault = { ...vault, entries: updatedEntries }
    await saveVault(updatedVault)
    setVault(updatedVault)
    setEntries(updatedEntries)
    setDecryptedPasswords(p => ({ ...p, [entryId]: newPassword }))
  }

  const handleToggleFavorite = async (id: string) => {
    if (!vault) return
    const updatedEntries = entries.map(e =>
      e.id === id ? { ...e, favorite: !e.favorite } : e,
    )
    const updatedVault = { ...vault, entries: updatedEntries }
    await saveVault(updatedVault)
    setVault(updatedVault)
    setEntries(updatedEntries)
  }

  const handleSettingsChange = (s: AppSettings) => {
    setSettings(s)
    resetAutoLock(s.autoLockMinutes)
  }

  const handleReset = () => {
    clearKey(keyRef)
    setVault(null)
    setEntries([])
    setDecryptedPasswords({})
    setScreen('setup')
  }

  const handleImport = async (imported: VaultStore) => {
    await saveVault(imported)
    setVault(imported)
    lock()
    setScreen('login')
  }

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

  if (screen === 'setup') {
    return <LoginScreen onLogin={handleLogin} onSetup={handleSetup} entryCount={null} isMobile={isMobile} />
  }

  if (screen === 'login') {
    return <LoginScreen onLogin={handleLogin} onSetup={handleSetup} entryCount={vault?.entries.length ?? 0} isMobile={isMobile} />
  }

  return (
    <MainLayout
      entries={entries}
      decryptedPasswords={decryptedPasswords}
      isUnlocked={true}
      settings={settings}
      vault={vault}
      onLock={lock}
      onAddEntry={handleAddEntry}
      onDeleteEntry={handleDeleteEntry}
      onFixEntry={handleFixEntry}
      onToggleFavorite={handleToggleFavorite}
      onSettingsChange={handleSettingsChange}
      onReset={handleReset}
      onImport={handleImport}
    />
  )
}
