import { useState, useCallback } from 'react'
import { Globe2, KeyRound, UserRound, Vault, X, Eye, EyeOff, RefreshCw } from 'lucide-react'

interface AddEntryModalProps {
  onAdd: (entry: { service: string; url: string; username: string; password: string }) => void
  onClose: () => void
  prefillPassword?: string
}

const CHARS = {
  upper:   'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower:   'abcdefghjkmnpqrstuvwxyz',
  digits:  '23456789',
  symbols: '!@#$%^&*',
}

function generateStrong() {
  const pool = CHARS.upper + CHARS.lower + CHARS.digits + CHARS.symbols
  return Array.from(crypto.getRandomValues(new Uint32Array(20)), v => pool[v % pool.length]).join('')
}

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
  const color = e < 50 ? 'text-red-700' : e < 80 ? 'text-amber-700' : 'text-emerald-700'
  const bar = e < 50 ? 'bg-red-700' : e < 80 ? 'bg-amber-700' : 'bg-emerald-700'
  const label = e < 50 ? 'Faible' : e < 80 ? 'Moyen' : 'Fort'
  return (
    <div className="mt-1.5">
      <div className="h-[3px] overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full transition-[width] duration-300 ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-[11px] ${color}`}>{label}</p>
    </div>
  )
}

const fieldShell = 'flex cursor-text items-center gap-2.5 rounded-xl bg-cream px-3 py-2.5 transition-shadow duration-150 focus-within:bg-white focus-within:shadow-sm'
const iconBtn = 'flex cursor-pointer border-0 bg-transparent p-1 text-inktext-faint transition-colors duration-150 hover:text-inktext'

export default function AddEntryModal({ onAdd, onClose, prefillPassword = '' }: AddEntryModalProps) {
  const [form, setForm] = useState({ service: '', url: '', username: '', password: prefillPassword })
  const [showPwd, setShowPwd] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const generate = useCallback(() => {
    setForm(f => ({ ...f, password: generateStrong() }))
    setShowPwd(true)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.service || !form.username || !form.password) return
    onAdd(form)
    onClose()
  }

  const fields = [
    { key: 'service',  icon: Vault,      placeholder: 'Service',          hint: 'Ex. Netflix, GitHub…', type: 'text' },
    { key: 'url',      icon: Globe2,     placeholder: 'Adresse du site',  hint: 'Optionnel', type: 'text' },
    { key: 'username', icon: UserRound,  placeholder: 'Identifiant',      hint: 'Email ou nom d\'utilisateur', type: 'text' },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4 py-5 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[400px] animate-fade flex-col gap-3 rounded-xl bg-white p-5 shadow-sm"
      >
        <div className="mb-1 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Vault size={18} strokeWidth={1.75} className="text-ink" />
            <div>
              <h2 className="text-[17px] font-semibold tracking-[-0.03em]">Nouvelle entrée</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className={`${iconBtn} mt-0.5 p-1.5`}>
            <X size={16} />
          </button>
        </div>

        {fields.map(({ key, icon: Icon, placeholder, hint, type }) => (
          <label key={key} className={fieldShell}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-inktext-muted">
              <Icon size={14} className="text-inktext-muted" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[10px] font-semibold tracking-[0.05em] text-inktext-faint">{placeholder}</span>
              <input
                type={type}
                value={form[key]}
                onChange={set(key)}
                placeholder={hint}
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
              <span className="mb-0.5 block text-[10px] font-semibold tracking-[0.05em] text-inktext-faint">Mot de passe</span>
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="Votre secret de connexion"
                className="block w-full border-0 bg-transparent font-mono text-[13px] text-inktext outline-none placeholder:text-inktext-faint"
              />
            </span>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => setShowPwd(s => !s)} className={iconBtn}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button type="button" onClick={generate} title="Générer un mot de passe fort" className={iconBtn}>
                <RefreshCw size={14} />
              </button>
            </div>
          </label>
          <StrengthBar password={form.password} />
        </div>

        <button
          type="submit"
          className="mt-1 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-ink-deep"
        >
          Ajouter au coffre
        </button>
      </form>
    </div>
  )
}
