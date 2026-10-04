import { useEffect, useState } from 'react'
import {
  Eye, EyeOff, Copy, Check,
  AlertTriangle, Trash2, RefreshCw, X, ExternalLink, Loader, Star,
} from 'lucide-react'
import { checkPasswordBreach } from '../services/hibpService'
import type { HibpResult, VaultEntry } from '../types/vault'
import ServiceLogo from './ServiceLogo'

function entropy(password: string) {
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 32
  return pool ? Math.floor(password.length * Math.log2(pool)) : 0
}

function strongPassword() {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
  return Array.from(crypto.getRandomValues(new Uint32Array(20)), v => pool[v % pool.length]).join('')
}

function strengthInfo(score: number, isPwned?: boolean) {
  if (isPwned) return { color: 'bg-red-700', text: 'text-red-700', label: 'Compromis' }
  if (score >= 80) return { color: 'bg-emerald-700', text: 'text-emerald-700', label: 'Fort' }
  if (score >= 50) return { color: 'bg-amber-700', text: 'text-amber-700', label: 'Moyen' }
  return { color: 'bg-red-700', text: 'text-red-700', label: 'Faible' }
}

function FieldLabel({ label }: { label: string }) {
  return <div className="mb-1.5 text-[11.5px] text-inktext-faint">{label}</div>
}

const iconBtn = 'flex cursor-pointer border-0 bg-transparent p-1 text-inktext-faint transition-colors duration-150 hover:rounded-lg hover:bg-cream hover:text-inktext'
const ghostBtn = 'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-cream px-0 py-2 text-[12.5px] font-medium text-inktext-muted no-underline transition-colors duration-150 hover:text-inktext'

function SecretField({
  label, value, mono = false, masked = false, onCopy, copied,
}: {
  label: string
  value: string
  mono?: boolean
  masked?: boolean
  onCopy: () => void
  copied: boolean
}) {
  const [visible, setVisible] = useState(!masked)
  return (
    <div className="mb-3.5">
      <FieldLabel label={label} />
      <div className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2.5">
        <span className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] ${mono ? 'font-mono' : ''} ${masked && !visible ? 'tracking-[2px]' : ''}`}>
          {masked && !visible ? '•'.repeat(Math.min(value.length || 8, 18)) : value}
        </span>
        <div className="flex shrink-0 gap-1">
          {masked && (
            <button onClick={() => setVisible(v => !v)} className={iconBtn}>
              {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
          <button onClick={onCopy} className={iconBtn}>
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VaultDetailPanel({
  entry, password, onDelete, onFixEntry, onToggleFavorite, onClose,
}: {
  entry: VaultEntry
  password: string
  onDelete: (id: string) => void
  onFixEntry: (id: string, pwd: string) => void
  onToggleFavorite?: () => void
  onClose?: () => void
}) {
  const [copied, setCopied] = useState<'username' | 'password' | null>(null)
  const [hibp, setHibp] = useState<HibpResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const score = entropy(password)
  const info  = strengthInfo(score, hibp?.isPwned)

  useEffect(() => {
    setConfirmDelete(false)
    setHibp(null)
    if (!password) return
    setChecking(true)
    checkPasswordBreach(password)
      .then(setHibp)
      .catch(() => setHibp(null))
      .finally(() => setChecking(false))
  }, [entry.id, password])

  const copy = async (type: 'username' | 'password', value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(type)
    setTimeout(() => setCopied(null), 1500)
  }

  const url = entry.url

  return (
    <div className="flex flex-col p-6">

      <div className="mb-6 flex items-center gap-3">
        <ServiceLogo service={entry.service} url={url} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{entry.service}</div>
          {url && (
            <a
              href={url.includes('://') ? url : `https://${url}`}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 flex items-center gap-1 text-xs text-inktext-faint no-underline"
            >
              {url.replace(/^https?:\/\//, '')} <ExternalLink size={10} />
            </a>
          )}
        </div>
        {onToggleFavorite && (
          <button onClick={onToggleFavorite} className={`${iconBtn} p-1.5`} title={entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
            <Star size={16} fill={entry.favorite ? '#D9A62E' : 'none'} className={entry.favorite ? 'text-[#D9A62E]' : 'text-inktext-faint'} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className={`${iconBtn} p-1.5`}>
            <X size={16} />
          </button>
        )}
      </div>

      <SecretField
        label="Identifiant"
        value={entry.username}
        onCopy={() => copy('username', entry.username)}
        copied={copied === 'username'}
      />

      <SecretField
        label="Mot de passe"
        value={password}
        mono
        masked
        onCopy={() => copy('password', password)}
        copied={copied === 'password'}
      />

      <div className="mb-4 flex items-center gap-1.5">
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${info.color}`} />
        <span className="text-[12.5px] text-inktext-muted">
          {info.label}
          {checking && ' · Vérification…'}
          {!checking && hibp?.isPwned && ` · vu ${hibp.count.toLocaleString()} fois`}
          {!checking && hibp && !hibp.isPwned && ' · non compromis'}
        </span>
        {checking && <Loader size={11} className="shrink-0 animate-spin text-inktext-faint" />}
      </div>

      <div className="mb-[18px]">
        <div className="mb-1 flex justify-between text-[11.5px] text-inktext-faint">
          <span>Entropie</span>
          <span className={info.text}>{score} bits</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-border">
          <div className={`h-full rounded-full transition-[width] duration-400 ${info.color}`} style={{ width: `${Math.min(score / 128 * 100, 100)}%` }} />
        </div>
      </div>

      {(hibp?.isPwned || score < 50) && (
        <div className="mb-4 flex gap-2 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] leading-snug text-red-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {hibp?.isPwned
              ? `Ce mot de passe est apparu ${hibp.count.toLocaleString()} fois dans des fuites de données connues.`
              : 'Ce mot de passe est trop faible. Remplacez-le par un mot de passe généré automatiquement.'}
          </span>
        </div>
      )}

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => onFixEntry(entry.id, strongPassword())}
          className={ghostBtn}
        >
          <RefreshCw size={13} /> Remplacer
        </button>
        {url && (
          <a
            href={url.includes('://') ? url : `https://${url}`}
            target="_blank"
            rel="noreferrer"
            className={ghostBtn}
          >
            <ExternalLink size={13} /> Ouvrir
          </a>
        )}
      </div>

      <div className="border-t border-transparent pt-4">
        {confirmDelete ? (
          <div className="flex gap-2">
            <button
              onClick={() => onDelete(entry.id)}
              className="flex-1 cursor-pointer rounded-xl border-0 bg-ink py-2 text-[12.5px] font-medium text-white"
            >
              Confirmer
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className={ghostBtn}
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[12.5px] text-inktext-faint"
          >
            <Trash2 size={13} /> Supprimer cette entrée
          </button>
        )}
      </div>
    </div>
  )
}
