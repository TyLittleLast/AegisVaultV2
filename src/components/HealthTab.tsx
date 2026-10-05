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
import ScoreGauge from './ScoreGauge'
import ServiceAvatar from './ServiceAvatar'
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

type IssueKind = 'pwned' | 'weak' | 'reused'

interface Issue {
  entry: VaultEntry
  kind: IssueKind
  reusedOn: number
}

const ISSUE_LABEL: Record<IssueKind, string> = {
  pwned: 'Compromis',
  weak: 'Faible',
  reused: 'Réutilisé',
}

const ISSUE_CHIP: Record<IssueKind, string> = {
  pwned: 'bg-red-500/15 text-red-700',
  weak: 'bg-orange-500/15 text-orange-700',
  reused: 'bg-amber-500/15 text-amber-700',
}

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

  /**
   * One actionable row per entry, worst problem first. A compromised password
   * outranks a weak one, which outranks mere reuse.
   */
  const issues = useMemo<Issue[]>(() => {
    const list: Issue[] = []
    for (const entry of entries) {
      const d = diags[entry.id]
      if (!d) continue
      const kind: IssueKind | null =
        d.pwnedCount > 0
          ? 'pwned'
          : d.entropy < STRENGTH_THRESHOLDS.strong
            ? 'weak'
            : d.reusedOn > 0
              ? 'reused'
              : null
      if (kind) list.push({ entry, kind, reusedOn: d.reusedOn })
    }
    return list
  }, [entries, diags])

  /** Mutually exclusive buckets, so the segments always sum to the entry count. */
  const distribution = useMemo(() => {
    let compromised = 0
    let weak = 0
    let reused = 0
    for (const entry of entries) {
      const d = diags[entry.id]
      if (!d) continue
      if (d.pwnedCount > 0) compromised++
      else if (d.entropy < STRENGTH_THRESHOLDS.strong) weak++
      else if (d.reusedOn > 0) reused++
    }
    const safe = entries.length - compromised - weak - reused
    return [
      { key: 'ok', label: 'Sains', count: safe, color: '#059669' },
      { key: 'reused', label: 'Réutilisés', count: reused, color: '#D97706' },
      { key: 'weak', label: 'Faibles', count: weak, color: '#EA580C' },
      { key: 'pwned', label: 'Compromis', count: compromised, color: '#DC2626' },
    ]
  }, [entries, diags])

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

      {/* Action first: the list of things to fix is what the tab is for. */}
      <section className="rounded-2xl bg-white p-5 shadow-card">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-sm font-semibold text-ink">Mots de passe à corriger</h2>
            <p className="m-0 mt-0.5 text-xs text-inktext-faint">
              {!auditedAt
                ? 'Lancez l’analyse pour détecter les entrées à renforcer.'
                : `${issues.length} entrée${issues.length > 1 ? 's' : ''} à traiter`}
            </p>
          </div>
          {issues.length > 0 && (
            <span className="shrink-0 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold tabular-nums text-red-700">
              {issues.length}
            </span>
          )}
        </header>

        {auditedAt && issues.length === 0 && (
          <div className="flex items-center gap-2.5 rounded-xl bg-cream p-4 text-sm text-emerald-700">
            <ShieldCheck size={16} className="shrink-0" />
            Aucun mot de passe faible, compromis ou réutilisé.
          </div>
        )}

        {!auditedAt && entries.length === 0 && (
          <p className="rounded-xl bg-cream p-4 text-sm text-inktext-faint">
            Le coffre est vide. Ajoutez un identifiant pour lancer une analyse.
          </p>
        )}

        {issues.length > 0 && (
          <ul className="flex flex-col gap-1">
            {issues.slice(0, 8).map(({ entry, kind, reusedOn }) => {
              const meta = searchIndex[entry.id]
              const diag = diags[entry.id]
              const detail =
                kind === 'pwned'
                  ? `${(diag?.pwnedCount ?? 0).toLocaleString('fr-FR')} occurrences`
                  : kind === 'weak'
                    ? `${diag?.entropy ?? 0} bits`
                    : `${reusedOn} autre${reusedOn > 1 ? 's' : ''} compte${reusedOn > 1 ? 's' : ''}`
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-150 hover:bg-cream"
                >
                  <ServiceAvatar label={meta?.service ?? entry.id} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-inktext">
                      {meta?.service ?? 'Entrée illisible'}
                    </div>
                    <div className="truncate text-xs text-inktext-faint">
                      {meta?.username ?? '—'}
                    </div>
                  </div>
                  <span
                    className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline ${ISSUE_CHIP[kind]}`}
                    title={detail}
                  >
                    {ISSUE_LABEL[kind]}
                  </span>
                  <button
                    onClick={() => void onFixEntry(entry.id)}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-deep"
                  >
                    <Wrench size={11} /> Corriger
                  </button>
                </li>
              )
            })}
            {issues.length > 8 && (
              <li className="px-2 pt-1.5 text-xs text-inktext-faint">
                et {issues.length - 8} autre{issues.length - 8 > 1 ? 's' : ''} entrée
                {issues.length - 8 > 1 ? 's' : ''}…
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-card">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ScoreGauge score={globalScore} />

          <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-sm font-semibold text-ink">Score de santé du coffre</h2>
              <button
                onClick={() => void runAudit()}
                disabled={running || entries.length === 0}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-cream px-2.5 py-1.5 text-xs font-medium text-inktext-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              >
                <RefreshCw size={12} className={running ? 'animate-spin' : ''} />
                {running ? 'Analyse…' : 'Analyser'}
              </button>
            </div>

            <div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-cream">
                {distribution.map((seg) =>
                  seg.count > 0 ? (
                    <div
                      key={seg.key}
                      className="transition-[width] duration-700 ease-out"
                      style={{
                        width: `${(seg.count / Math.max(1, entries.length)) * 100}%`,
                        backgroundColor: seg.color,
                      }}
                      title={`${seg.label} : ${seg.count}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {distribution.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-xs text-inktext-muted">{seg.label}</span>
                    <span className="ml-auto text-xs font-semibold tabular-nums text-inktext">
                      {seg.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {auditedLabel && (
              <p className="m-0 text-xs text-inktext-faint">Dernière analyse à {auditedLabel}</p>
            )}
          </div>
        </div>
      </section>

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
