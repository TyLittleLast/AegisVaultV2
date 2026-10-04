import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  RefreshCw,
  X,
  ExternalLink,
  Star,
} from 'lucide-react'
import { checkPasswordBreach } from '../services/hibpService'
import { copySecret } from '../utils/clipboard'
import { STRENGTH_THRESHOLDS, grade } from '../utils/password'
import { displayUrl, safeExternalUrl } from '../utils/url'
import type { EntrySearchMeta, HibpResult, VaultEntry } from '../types/vault'
import ServiceAvatar from './ServiceAvatar'

/** Seconds a revealed password stays on screen before being masked again. */
const REVEAL_TIMEOUT_MS = 30_000

const iconBtn =
  'flex cursor-pointer border-0 bg-transparent p-1 text-inktext-faint transition-colors duration-150 hover:rounded-lg hover:bg-cream hover:text-inktext'
const ghostBtn =
  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-cream px-3 py-2 text-[12.5px] font-medium text-inktext-muted no-underline transition-colors duration-150 hover:text-inktext'

function FieldLabel({ label }: { label: string }) {
  return <div className="mb-1.5 text-[11.5px] text-inktext-faint">{label}</div>
}

function SecretField({
  label,
  value,
  mono = false,
  copyable = true,
}: {
  label: string
  value: string
  mono?: boolean
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!value) return
    const ok = await copySecret(value)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-3.5">
      <FieldLabel label={label} />
      <div className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2.5">
        <span
          className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] ${mono ? 'font-mono' : ''}`}
        >
          {value || '—'}
        </span>
        {copyable && (
          <button onClick={copy} className={iconBtn} aria-label={`Copier ${label}`}>
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function VaultDetailPanel({
  entry,
  meta,
  revealSecrets,
  hibpEnabled,
  onDelete,
  onFixEntry,
  onToggleFavorite,
  onClose,
}: {
  entry: VaultEntry
  meta: EntrySearchMeta | undefined
  revealSecrets: (entryId: string) => Promise<{ password: string; url: string }>
  hibpEnabled: boolean
  onDelete: (id: string) => void
  onFixEntry: (entryId: string) => void | Promise<void>
  onToggleFavorite?: () => void
  onClose?: () => void
}) {
  const [password, setPassword] = useState<string | null>(null)
  const [rawUrl, setRawUrl] = useState<string>('')
  const [revealed, setRevealed] = useState(false)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [hibp, setHibp] = useState<{ subject: string; result: HibpResult | null } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Per-entry state is reset by remounting this panel with a `key` of the entry
  // id, so there is no reset effect and no stale password can survive a switch.

  // Breach checks only happen when the user has opted in, and only for a
  // password that has actually been revealed.
  //
  // State is written only from the promise callbacks. Tagging the result with
  // the password it describes lets both "is this badge current" and "is a check
  // still running" be derived at render time, instead of resetting state
  // synchronously inside the effect.
  useEffect(() => {
    if (!hibpEnabled || !password) return
    const controller = new AbortController()
    let cancelled = false
    checkPasswordBreach(password, controller.signal)
      .then((result) => {
        if (!cancelled) setHibp({ subject: password, result })
      })
      .catch(() => {
        if (!cancelled) setHibp({ subject: password, result: null })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [hibpEnabled, password])

  const hibpCurrent = Boolean(hibpEnabled && password) && hibp?.subject === password
  const hibpResult = hibpCurrent ? hibp.result : null
  const hibpLoading = Boolean(hibpEnabled && password) && !hibpCurrent

  const reveal = useCallback(async () => {
    if (password) {
      setRevealed((v) => !v)
      return
    }
    setRevealing(true)
    setRevealError(null)
    try {
      const secrets = await revealSecrets(entry.id)
      setPassword(secrets.password)
      setRawUrl(secrets.url)
      setRevealed(true)
    } catch (err: unknown) {
      setRevealError(err instanceof Error ? err.message : 'Déchiffrement impossible.')
    } finally {
      setRevealing(false)
    }
  }, [entry.id, password, revealSecrets])

  // Auto-hide the revealed password so it is not left on screen unattended.
  useEffect(() => {
    if (revealed) {
      revealTimer.current = setTimeout(() => setRevealed(false), REVEAL_TIMEOUT_MS)
    }
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current)
    }
  }, [revealed])

  const bits = entry.entropy ?? 0
  const info = grade(bits, hibpResult?.isPwned)
  const serviceLabel = meta?.service ?? 'Entrée illisible'
  const safeUrl = safeExternalUrl(rawUrl)

  return (
    <div className="flex flex-col p-6">
      <div className="mb-6 flex items-center gap-3">
        <ServiceAvatar label={serviceLabel} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{serviceLabel}</div>
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-0.5 flex items-center gap-1 text-xs text-inktext-faint no-underline"
            >
              {displayUrl(rawUrl)} <ExternalLink size={10} />
            </a>
          )}
        </div>
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={`${iconBtn} p-1.5`}
            title={entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-label={entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star
              size={16}
              fill={entry.favorite ? '#D9A62E' : 'none'}
              className={entry.favorite ? 'text-[#D9A62E]' : 'text-inktext-faint'}
            />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className={`${iconBtn} p-1.5`} aria-label="Fermer">
            <X size={16} />
          </button>
        )}
      </div>

      <SecretField label="Identifiant" value={meta?.username ?? ''} />

      <div className="mb-3.5">
        <FieldLabel label="Mot de passe" />
        <div className="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2.5">
          <span
            className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] ${
              revealed && password ? '' : 'tracking-[2px]'
            }`}
          >
            {revealed && password
              ? password
              : '•'.repeat(Math.max(8, Math.min(password?.length ?? 0, 18)))}
          </span>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => void reveal()}
              disabled={revealing}
              className={iconBtn}
              aria-label={
                password ? (revealed ? 'Masquer' : 'Afficher') : 'Déchiffrer le mot de passe'
              }
              title="Déchiffrer à la demande"
            >
              {revealing ? (
                <span className="text-[10px]">…</span>
              ) : revealed ? (
                <EyeOff size={14} />
              ) : (
                <Eye size={14} />
              )}
            </button>
            <button
              onClick={() => password && void copySecret(password)}
              className={iconBtn}
              disabled={!password}
              aria-label="Copier le mot de passe"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-inktext-faint">
          {revealError ??
            (password
              ? 'Le presse-papiers est effacé automatiquement après 30 secondes.'
              : 'Le mot de passe n’est déchiffré qu’à l’ouverture, jamais au chargement du coffre.')}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-1.5">
        <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${info.bar}`} />
        <span className="text-[12.5px] text-inktext-muted">
          {info.label}
          {hibpLoading && ' · vérification…'}
          {!hibpLoading &&
            hibpResult?.isPwned &&
            ` · vu ${hibpResult.count.toLocaleString('fr-FR')} fois`}
          {!hibpLoading && hibpResult && !hibpResult.isPwned && ' · non compromis'}
        </span>
      </div>

      <div className="mb-[18px]">
        <div className="mb-1 flex justify-between text-[11.5px] text-inktext-faint">
          <span>Entropie estimée</span>
          <span className={info.text}>{bits} bits</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${info.bar}`}
            style={{ width: `${Math.min((bits / 128) * 100, 100)}%` }}
          />
        </div>
      </div>

      {(hibpResult?.isPwned || bits < STRENGTH_THRESHOLDS.medium) && (
        <div className="mb-4 flex gap-2 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] leading-snug text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {hibpResult?.isPwned
              ? `Ce mot de passe est apparu ${hibpResult.count.toLocaleString('fr-FR')} fois dans des fuites connues.`
              : 'Ce mot de passe est trop faible. Remplacez-le par un mot de passe généré localement.'}
          </span>
        </div>
      )}

      <div className="mb-5 flex gap-2">
        <button onClick={() => void onFixEntry(entry.id)} className={ghostBtn}>
          <RefreshCw size={13} /> Remplacer
        </button>
        {safeUrl && (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer nofollow" className={ghostBtn}>
            <ExternalLink size={13} /> Ouvrir
          </a>
        )}
      </div>

      <div className="border-t border-transparent pt-4">
        {confirmDelete ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-inktext-muted">
              Cette entrée sera définitivement supprimée du coffre.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onDelete(entry.id)}
                className="flex-1 cursor-pointer rounded-xl border-0 bg-ink py-2 text-[12.5px] font-medium text-white"
              >
                Confirmer
              </button>
              <button onClick={() => setConfirmDelete(false)} className={ghostBtn}>
                Annuler
              </button>
            </div>
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
