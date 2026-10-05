import { useCallback, useMemo, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  Wrench,
  Repeat2,
} from 'lucide-react'
import { checkPasswordBreach } from '../services/hibpService'
import { STRENGTH_THRESHOLDS, entropy as calcEntropy } from '../utils/password'
import StorageCard from './StorageCard'
import type { PersistenceOutcome, StorageDurability } from '../services/storageService'
import type { EntrySearchMeta, VaultEntry } from '../types/vault'

interface HealthTabProps {
  entries: VaultEntry[]
  searchIndex: Record<string, EntrySearchMeta>
  hibpEnabled: boolean
  revealAll: () => Promise<Record<string, string>>
  onFixEntry: (entryId: string) => void | Promise<void>
  durability: StorageDurability | null
  requestingPersist: boolean
  persistOutcome: PersistenceOutcome
  onRequestPersist: () => void
}

interface EntryDiag {
  pwnedCount: number
  entropy: number
  reusedOn: number
  score: number
}

type Filter = 'all' | 'pwned' | 'weak' | 'reused'

function healthScore(pwned: boolean, bits: number, reused: boolean): number {
  if (pwned) return reused ? 10 : 15
  let score =
    bits >= STRENGTH_THRESHOLDS.strong ? 100 : bits >= STRENGTH_THRESHOLDS.medium ? 70 : 40
  if (reused) score -= 20
  return Math.max(0, score)
}

export default function HealthTab({
  entries,
  searchIndex,
  hibpEnabled,
  revealAll,
  onFixEntry,
  durability,
  requestingPersist,
  persistOutcome,
  onRequestPersist,
}: HealthTabProps) {
  const [diags, setDiags] = useState<Record<string, EntryDiag>>({})
  const [running, setRunning] = useState(false)
  const [auditedAt, setAuditedAt] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  /**
   * Explicit, user-triggered. Decrypted passwords stay inside this function:
   * only derived diagnostics are kept in state, so a password never reaches
   * React state even during an audit.
   */
  const runAudit = useCallback(async () => {
    if (entries.length === 0) return
    setRunning(true)
    try {
      const passwords = await revealAll()

      const usage = new Map<string, string[]>()
      for (const entry of entries) {
        const pwd = passwords[entry.id]
        if (!pwd) continue
        const bucket = usage.get(pwd)
        if (bucket) bucket.push(entry.id)
        else usage.set(pwd, [entry.id])
      }

      const next: Record<string, EntryDiag> = {}
      for (const entry of entries) {
        const pwd = passwords[entry.id] ?? ''
        const bits = pwd ? calcEntropy(pwd) : 0
        const reusedOn = Math.max(0, (usage.get(pwd)?.length ?? 0) - 1)

        let pwnedCount = 0
        if (hibpEnabled && pwd) {
          try {
            pwnedCount = (await checkPasswordBreach(pwd)).count
          } catch {
            // Offline or rate limited: fall back to local checks only.
          }
        }
        next[entry.id] = {
          pwnedCount,
          entropy: bits,
          reusedOn,
          score: pwd ? healthScore(pwnedCount > 0, bits, reusedOn > 0) : 0,
        }
      }

      setDiags(next)
      setAuditedAt(new Date().toISOString())
    } finally {
      setRunning(false)
    }
  }, [entries, hibpEnabled, revealAll])

  const results = useMemo(() => Object.values(diags), [diags])
  const globalScore =
    results.length === 0
      ? null
      : Math.round(results.reduce((sum, d) => sum + d.score, 0) / results.length)

  const stats = useMemo(
    () => ({
      pwned: entries.filter((e) => (diags[e.id]?.pwnedCount ?? 0) > 0).length,
      weak: entries.filter((e) => {
        const d = diags[e.id]
        if (!d || (d.pwnedCount ?? 0) > 0) return false
        return d.entropy < STRENGTH_THRESHOLDS.strong
      }).length,
      reused: entries.filter((e) => (diags[e.id]?.reusedOn ?? 0) > 0).length,
    }),
    [entries, diags],
  )

  const filtered = entries.filter((e) => {
    const d = diags[e.id]
    if (filter === 'pwned') return (d?.pwnedCount ?? 0) > 0
    if (filter === 'weak') {
      if (!d || (d.pwnedCount ?? 0) > 0) return false
      return d.entropy < STRENGTH_THRESHOLDS.strong
    }
    if (filter === 'reused') return (d?.reusedOn ?? 0) > 0
    return true
  })

  const FILTERS: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: 'Tout', count: entries.length },
    { id: 'pwned', label: 'Compromis', count: stats.pwned },
    { id: 'weak', label: 'À revoir', count: stats.weak },
    { id: 'reused', label: 'Réutilisés', count: stats.reused },
  ]

  const auditedLabel = auditedAt
    ? new Date(auditedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="mx-auto flex max-w-2xl animate-rise flex-col gap-5">
      <p className="text-sm text-inktext-muted">
        Analyse locale de la robustesse et de la réutilisation
        {hibpEnabled ? ', complétée par une vérification k-anonymat des fuites.' : '.'} Les mots de
        passe ne quittent l&apos;appareil pendant l&apos;analyse.
      </p>

      <StorageCard
        durability={durability}
        requesting={requestingPersist}
        persistOutcome={persistOutcome}
        onRequestPersist={onRequestPersist}
      />

      <div className="flex items-center gap-5 rounded-xl bg-white p-6 shadow-card">
        <div className="text-5xl font-semibold tabular-nums text-ink">
          {globalScore === null ? '—' : globalScore}
          {globalScore !== null && <span className="text-2xl">%</span>}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex justify-between text-sm text-inktext-muted">
            <span>Score de santé du coffre</span>
            <button
              onClick={() => void runAudit()}
              disabled={running || entries.length === 0}
              className="flex cursor-pointer items-center gap-1.5 text-inktext-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
              {running ? 'Analyse…' : 'Analyser'}
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream">
            <div
              className="h-full rounded-full bg-ink transition-all duration-700"
              style={{ width: `${globalScore ?? 0}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-inktext-faint">
            <span>{stats.pwned} compromis</span>
            <span>{stats.weak} à revoir</span>
            <span>{stats.reused} réutilisés</span>
            {auditedLabel && <span>analysé à {auditedLabel}</span>}
          </div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-white text-ink shadow-card'
                  : 'text-inktext-muted hover:bg-white/70 hover:text-inktext'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <p className="mt-8 text-center text-sm text-inktext-faint">
            {auditedAt
              ? 'Aucune entrée dans cette catégorie.'
              : 'Lancez l’analyse pour auditer le coffre.'}
          </p>
        )}

        {filtered.map((entry) => {
          const d = diags[entry.id]
          const meta = searchIndex[entry.id]
          const isPwned = (d?.pwnedCount ?? 0) > 0
          const grade = d
            ? d.entropy >= STRENGTH_THRESHOLDS.strong
              ? 'strong'
              : d.entropy >= STRENGTH_THRESHOLDS.medium
                ? 'medium'
                : 'weak'
            : 'strong'
          const isWeak = !!d && !isPwned && grade === 'weak'
          const isMedium = !!d && !isPwned && grade === 'medium'
          const isReused = !!d && (d.reusedOn ?? 0) > 0
          const isOk = !!d && !isPwned && !isReused && grade === 'strong'
          const isOpen = expanded === entry.id

          return (
            <div
              key={entry.id}
              className={`overflow-hidden rounded-xl transition-colors ${isOpen ? 'bg-white shadow-card' : 'hover:bg-white/70'}`}
            >
              <button
                className="flex min-h-[60px] w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left"
                onClick={() => setExpanded(isOpen ? null : entry.id)}
                aria-expanded={isOpen}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-inktext">
                    {meta?.service ?? 'Entrée illisible'}
                  </p>
                  <p className="truncate text-xs text-inktext-faint">{meta?.username ?? '—'}</p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {isPwned && (
                    <span className="text-red-600" title="Compromis" aria-label="Compromis">
                      <X size={15} strokeWidth={2.5} />
                    </span>
                  )}
                  {isWeak && (
                    <span
                      className="text-red-600"
                      title="Mot de passe faible"
                      aria-label="Mot de passe faible"
                    >
                      <AlertTriangle size={14} />
                    </span>
                  )}
                  {isMedium && (
                    <span
                      className="text-amber-600"
                      title="Mot de passe moyen"
                      aria-label="Mot de passe moyen"
                    >
                      <AlertTriangle size={14} />
                    </span>
                  )}
                  {isReused && (
                    <span
                      className="text-amber-600"
                      title="Mot de passe réutilisé"
                      aria-label="Mot de passe réutilisé"
                    >
                      <Repeat2 size={14} />
                    </span>
                  )}
                  {isOk && (
                    <span className="text-emerald-600" title="Sécurisé" aria-label="Sécurisé">
                      <ShieldCheck size={15} strokeWidth={2.5} />
                    </span>
                  )}
                  {d && (
                    <span className="w-8 text-right text-xs font-bold tabular-nums text-inktext-faint">
                      {d.score}%
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronUp size={14} className="text-inktext-faint" />
                  ) : (
                    <ChevronDown size={14} className="text-inktext-faint" />
                  )}
                </div>
              </button>

              {isOpen && d && (
                <div className="flex flex-col gap-3 px-3.5 pb-4 pt-1">
                  {isPwned && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-red-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold">
                        <ShieldAlert size={12} /> Mot de passe compromis
                      </p>
                      Ce mot de passe est apparu{' '}
                      <strong>{d.pwnedCount.toLocaleString('fr-FR')} fois</strong> dans des fuites
                      de données publiques. Même long, il n&apos;est plus sûr : remplacez-le.
                    </div>
                  )}
                  {isWeak && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-red-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold">
                        <AlertTriangle size={12} /> Mot de passe faible
                      </p>
                      Entropie estimée : <strong>{d.entropy} bits</strong> (seuil robuste : 80
                      bits).
                    </div>
                  )}
                  {isMedium && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-amber-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold">
                        <AlertTriangle size={12} /> Mot de passe moyen
                      </p>
                      Entropie estimée : <strong>{d.entropy} bits</strong>. Correct, mais sous le
                      niveau « fort » (80 bits).
                    </div>
                  )}
                  {isReused && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-amber-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold">
                        <AlertTriangle size={12} /> Mot de passe réutilisé
                      </p>
                      Utilisé sur{' '}
                      <strong>
                        {d.reusedOn} autre{d.reusedOn > 1 ? 's' : ''} compte
                        {d.reusedOn > 1 ? 's' : ''}
                      </strong>
                      . Si l&apos;un de ces services est compromis, tous vos comptes le sont.
                    </div>
                  )}
                  {isOk && (
                    <div className="rounded-xl bg-cream p-3 text-xs text-emerald-700">
                      <p className="flex items-center gap-1.5">
                        <ShieldCheck size={12} /> Aucun problème détecté — robuste, unique et non
                        compromis.
                      </p>
                    </div>
                  )}
                  {(isPwned || isWeak || isMedium || isReused) && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-cream p-3">
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-inktext">Plan d’action</p>
                        <p className="text-xs text-inktext-faint">
                          Généré localement, jamais transmis.
                        </p>
                      </div>
                      <button
                        onClick={() => void onFixEntry(entry.id)}
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-deep"
                      >
                        <Wrench size={11} /> Corriger
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
