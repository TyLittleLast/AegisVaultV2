import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe2, KeyRound, UserRound, Vault, X, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { STRENGTH_THRESHOLDS, entropy as calcEntropy, generateStrongPassword } from '../utils/password'
import type { EntryInput } from '../types/vault'

interface AddEntryModalProps {
  onAdd: (entry: EntryInput) => void
  onClose: () => void
  prefillPassword?: string
}

const TEXT_FIELDS = [
  { key: 'service', icon: Vault, label: 'Service', hint: 'Ex. Netflix, GitHub…', autoComplete: 'off' },
  { key: 'url', icon: Globe2, label: 'Adresse du site', hint: 'Optionnel', autoComplete: 'url' },
  { key: 'username', icon: UserRound, label: 'Identifiant', hint: 'Email ou nom d’utilisateur', autoComplete: 'username' },
] as const

const fieldShell =
  'flex cursor-text items-center gap-2.5 rounded-xl bg-cream px-3 py-2.5 transition-shadow duration-150 focus-within:bg-white focus-within:shadow-sm'
const iconBtn =
  'flex cursor-pointer border-0 bg-transparent p-1 text-inktext-faint transition-colors duration-150 hover:text-inktext'

function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  const bits = calcEntropy(password)
  const pct = Math.min((bits / 128) * 100, 100)
  const color =
    bits < STRENGTH_THRESHOLDS.medium ? 'text-red-600' : bits < STRENGTH_THRESHOLDS.strong ? 'text-amber-600' : 'text-emerald-600'
  const bar =
    bits < STRENGTH_THRESHOLDS.medium ? 'bg-red-600' : bits < STRENGTH_THRESHOLDS.strong ? 'bg-amber-600' : 'bg-emerald-600'
  const label = bits < STRENGTH_THRESHOLDS.medium ? 'Faible' : bits < STRENGTH_THRESHOLDS.strong ? 'Moyen' : 'Fort'
  return (
    <div className="mt-1.5">
      <div className="h-[3px] overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`mt-1 text-[11px] ${color}`}>
        {label} — {bits} bits
      </p>
    </div>
  )
}

export default function AddEntryModal({ onAdd, onClose, prefillPassword = '' }: AddEntryModalProps) {
  const [form, setForm] = useState<EntryInput>({
    service: '',
    url: '',
    username: '',
    password: prefillPassword,
  })
  const [showPwd, setShowPwd] = useState(false)
  const dialogRef = useRef<HTMLFormElement>(null)

  const set = (k: keyof EntryInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const generate = useCallback(() => {
    setForm((f) => ({ ...f, password: generateStrongPassword() }))
    setShowPwd(true)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.service || !form.username || !form.password) return
    onAdd(form)
    onClose()
  }

  // Escape closes, Tab is trapped inside the dialog, and focus lands on the
  // first field on open — without this the page behind stays reachable.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href]',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4 py-5 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-entry-title"
        onSubmit={handleSubmit}
        className="flex w-full max-w-[400px] animate-fade flex-col gap-3 rounded-xl bg-white p-5 shadow-sm"
      >
        <div className="mb-1 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Vault size={18} strokeWidth={1.75} className="text-ink" />
            <h2 id="add-entry-title" className="text-[17px] font-semibold tracking-[-0.03em]">
              Nouvelle entrée
            </h2>
          </div>
          <button type="button" onClick={onClose} className={`${iconBtn} mt-0.5 p-1.5`} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        {TEXT_FIELDS.map(({ key, icon: Icon, label, hint, autoComplete }) => (
          <label key={key} className={fieldShell}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-inktext-muted">
              <Icon size={14} className="text-inktext-muted" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[10px] font-semibold tracking-[0.05em] text-inktext-faint">
                {label}
              </span>
              <input
                type="text"
                value={form[key]}
                onChange={set(key)}
                placeholder={hint}
                autoComplete={autoComplete}
                className="block w-full border-0 bg-transparent text-[13.5px] text-inktext outline-none placeholder:text-inktext-faint"
              />
            </span>
          </label>
        ))}

        <div>
          <label className={fieldShell}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-inktext-muted">
              <KeyRound size={14} className="text-inktext-muted" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[10px] font-semibold tracking-[0.05em] text-inktext-faint">
                Mot de passe
              </span>
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="Votre secret de connexion"
                autoComplete="new-password"
                className="block w-full border-0 bg-transparent font-mono text-[13px] text-inktext outline-none placeholder:text-inktext-faint"
              />
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className={iconBtn}
                aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={generate}
                title="Générer un mot de passe fort"
                aria-label="Générer un mot de passe fort"
                className={iconBtn}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </label>
          <StrengthBar password={form.password} />
        </div>

        <button
          type="submit"
          disabled={!form.service || !form.username || !form.password}
          className="mt-1 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-ink-deep disabled:cursor-not-allowed disabled:opacity-45"
        >
          Ajouter au coffre
        </button>
      </form>
    </div>
  )
}