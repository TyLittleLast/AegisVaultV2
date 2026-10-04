import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle,
  X,
  ChevronDown, ChevronUp, Wrench, Loader,
  Repeat2,
} from 'lucide-react'
import { checkPasswordBreach } from '../services/hibpService'
import type { VaultEntry } from '../types/vault'

interface HealthTabProps {
  entries: VaultEntry[]
  decryptedPasswords: Record<string, string>
  onFixEntry: (entryId: string, newPassword: string) => void
}

interface EntryDiag {
  pwnedCount: number
  entropy: number
  reusedOn: number
  score: number
  checking: boolean
  done: boolean
}

type Filter = 'all' | 'pwned' | 'weak' | 'reused'

function calcEntropy(pwd: string): number {
  let pool = 0
  if (/[a-z]/.test(pwd)) pool += 26
  if (/[A-Z]/.test(pwd)) pool += 26
  if (/[0-9]/.test(pwd)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 32
  return pool > 0 ? Math.floor(pwd.length * Math.log2(pool)) : 0
}

function entropyGrade(entropy: number): 'weak' | 'medium' | 'strong' {
  if (entropy < 50) return 'weak'
  if (entropy < 80) return 'medium'
  return 'strong'
}

function healthScore(pwned: boolean, entropy: number, reused: boolean): number {
  if (pwned) return reused ? 10 : 15
  const grade = entropyGrade(entropy)
  let score = grade === 'strong' ? 100 : grade === 'medium' ? 70 : 40
  if (reused) score -= 20
  return Math.max(0, score)
}

function generateStrong(): string {
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
  const arr = crypto.getRandomValues(new Uint32Array(20))
  return Array.from(arr, n => pool[n % pool.length]).join('')
}

export default function HealthTab({ entries, decryptedPasswords, onFixEntry }: HealthTabProps) {
  const [diags, setDiags] = useState<Record<string, EntryDiag>>({})
  const [globalLoading, setGlobalLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const pwdCounts = useMemo(() => {
    const acc: Record<string, string[]> = {}
    for (const e of entries) {
      const pwd = decryptedPasswords[e.id]
      if (!pwd) continue
      acc[pwd] = [...(acc[pwd] ?? []), e.id]
    }
    return acc
  }, [entries, decryptedPasswords])

  const runAudit = useCallback(async () => {
    if (entries.length === 0) return
    setGlobalLoading(true)
    const init: Record<string, EntryDiag> = {}
    for (const e of entries) {
      const pwd = decryptedPasswords[e.id] ?? ''
      init[e.id] = { pwnedCount: 0, entropy: calcEntropy(pwd), reusedOn: Math.max(0, (pwdCounts[pwd]?.length ?? 1) - 1), score: 100, checking: true, done: false }
    }
    setDiags(init)
    for (const e of entries) {
      const pwd = decryptedPasswords[e.id]
      if (!pwd) continue
      let pwnedCount = 0
      try { pwnedCount = (await checkPasswordBreach(pwd)).count } catch { /* indisponible */ }
      const entropy = calcEntropy(pwd)
      const reusedOn = Math.max(0, (pwdCounts[pwd]?.length ?? 1) - 1)
      const pwned = pwnedCount > 0
      const score = healthScore(pwned, entropy, reusedOn > 0)
      setDiags(prev => ({ ...prev, [e.id]: { pwnedCount, entropy, reusedOn, score, checking: false, done: true } }))
    }
    for (const e of entries) {
      if (decryptedPasswords[e.id]) continue
      setDiags(prev => {
        const cur = prev[e.id]
        if (!cur) return prev
        return { ...prev, [e.id]: { ...cur, checking: false, done: true, score: 0 } }
      })
    }
    setGlobalLoading(false)
  }, [entries, decryptedPasswords, pwdCounts])

  useEffect(() => {
    void runAudit()
  }, [runAudit])

  const doneEntries = Object.values(diags).filter(d => d.done)
  const globalScore = doneEntries.length === 0 ? null
    : Math.round(doneEntries.reduce((s, d) => s + d.score, 0) / doneEntries.length)

  const scoreColor = globalScore === null ? 'text-inktext-faint' : 'text-ink'
  const barColor = globalScore === null ? 'bg-ink-light' : 'bg-ink'

  const stats = {
    pwned:  entries.filter(e => (diags[e.id]?.pwnedCount ?? 0) > 0).length,
    weak:   entries.filter(e => {
      const d = diags[e.id]
      if (!d?.done || (d.pwnedCount ?? 0) > 0) return false
      return entropyGrade(d.entropy) !== 'strong'
    }).length,
    reused: entries.filter(e => (diags[e.id]?.reusedOn ?? 0) > 0).length,
  }

  const filtered = entries.filter(e => {
    const d = diags[e.id]
    if (filter === 'pwned') return (d?.pwnedCount ?? 0) > 0
    if (filter === 'weak') {
      if (!d?.done || (d.pwnedCount ?? 0) > 0) return false
      return entropyGrade(d.entropy) !== 'strong'
    }
    if (filter === 'reused') return (d?.reusedOn ?? 0) > 0
    return true
  })

  const FILTERS: { id: Filter; label: string; count: number }[] = [
    { id: 'all',    label: 'Tout',       count: entries.length },
    { id: 'pwned',  label: 'Compromis',  count: stats.pwned },
    { id: 'weak',   label: 'À revoir',   count: stats.weak },
    { id: 'reused', label: 'Réutilisés', count: stats.reused },
  ]

  return (
    <div className="mx-auto flex max-w-2xl animate-rise flex-col gap-5">

      <div className="flex items-center gap-5 rounded-xl bg-white p-6 shadow-sm">
        <div className={`text-5xl font-semibold tabular-nums ${scoreColor}`}>
          {globalScore === null ? '—' : globalScore}{globalScore !== null && <span className="text-2xl">%</span>}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex justify-between text-sm text-inktext-muted">
            <span>Score de santé du coffre</span>
            <button onClick={runAudit} disabled={globalLoading || entries.length === 0}
              className="flex items-center gap-1.5 text-inktext-muted transition-colors hover:text-ink disabled:opacity-30">
              <RefreshCw size={12} className={globalLoading ? 'animate-spin' : ''} />
              {globalLoading ? 'Analyse…' : 'Analyser'}
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream">
            <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${globalScore ?? 0}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-inktext-faint">
            <span>{stats.pwned} compromis</span>
            <span>{stats.weak} à revoir</span>
            <span>{stats.reused} réutilisés</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? 'bg-white text-ink shadow-sm'
                : 'text-inktext-muted hover:bg-white/70 hover:text-inktext'
            }`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <p className="mt-8 text-center text-sm text-black/30">
            {Object.keys(diags).length === 0 ? 'Cliquez sur « Analyser » pour lancer l\'audit.' : 'Aucune entrée dans cette catégorie.'}
          </p>
        )}

        {filtered.map(e => {
          const d = diags[e.id]
          const isPwned  = (d?.pwnedCount ?? 0) > 0
          const grade    = d ? entropyGrade(d.entropy) : 'strong'
          const isWeak   = d?.done && !isPwned && grade === 'weak'
          const isMedium = d?.done && !isPwned && grade === 'medium'
          const isReused = d?.done && (d?.reusedOn ?? 0) > 0
          const isOk     = d?.done && !isPwned && !isReused && grade === 'strong'
          const isOpen   = expanded === e.id

          return (
            <div key={e.id} className={`overflow-hidden rounded-xl transition-colors ${isOpen ? 'bg-white shadow-sm' : 'hover:bg-white/70'}`}>

              <button className="flex min-h-[60px] w-full items-center justify-between px-3.5 py-2.5 text-left"
                onClick={() => setExpanded(isOpen ? null : e.id)}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-inktext">{e.service}</p>
                  <p className="truncate text-xs text-black/40">{e.username}</p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {d?.checking && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-black/40" title="Vérification en cours" aria-label="Vérification en cours">
                      <Loader size={13} className="animate-spin" />
                    </span>
                  )}
                  {!d?.checking && isPwned && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" title="Compromis" aria-label="Compromis">
                      <X size={15} strokeWidth={2.5} />
                    </span>
                  )}
                  {!d?.checking && isWeak && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600" title="Mot de passe faible" aria-label="Mot de passe faible">
                      <AlertTriangle size={14} />
                    </span>
                  )}
                  {!d?.checking && isMedium && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600" title="Mot de passe moyen" aria-label="Mot de passe moyen">
                      <AlertTriangle size={14} />
                    </span>
                  )}
                  {!d?.checking && isReused && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600" title="Mot de passe réutilisé" aria-label="Mot de passe réutilisé">
                      <Repeat2 size={14} />
                    </span>
                  )}
                  {!d?.checking && isOk && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600" title="Sécurisé" aria-label="Sécurisé">
                      <ShieldCheck size={15} strokeWidth={2.5} />
                    </span>
                  )}
                  {d?.done && <span className="w-8 text-right text-xs font-bold tabular-nums text-black/30">{d.score}%</span>}
                  {isOpen ? <ChevronUp size={14} className="text-black/30" /> : <ChevronDown size={14} className="text-black/30" />}
                </div>
              </button>

              {isOpen && d?.done && (
                <div className="flex flex-col gap-3 px-3.5 pb-4 pt-1">
                  {isPwned && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-red-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldAlert size={12} /> Mot de passe compromis</p>
                      Ce mot de passe est apparu <strong>{d.pwnedCount.toLocaleString()} fois</strong> dans des fuites de données publiques (analyse k-anonymat HIBP). Même s’il est long, il n’est plus sûr : remplacez-le.
                    </div>
                  )}
                  {!isPwned && isWeak && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-red-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={12} /> Mot de passe faible</p>
                      Entropie estimée : <strong>{d.entropy} bits</strong> (seuil fort : 80 bits). Ce mot de passe peut être deviné rapidement.
                    </div>
                  )}
                  {!isPwned && isMedium && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-amber-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={12} /> Mot de passe moyen</p>
                      Entropie estimée : <strong>{d.entropy} bits</strong>. Correct, mais pas encore au niveau « fort » (80 bits et plus).
                    </div>
                  )}
                  {isReused && (
                    <div className="rounded-xl bg-cream p-3 text-xs leading-relaxed text-amber-700">
                      <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={12} /> Mot de passe réutilisé</p>
                      Ce mot de passe est utilisé sur <strong>{d.reusedOn} autre{d.reusedOn > 1 ? 's' : ''} compte{d.reusedOn > 1 ? 's' : ''}</strong>. Si l'un de ces services est compromis, tous vos comptes sont en danger.
                    </div>
                  )}
                  {isOk && (
                    <div className="rounded-xl bg-cream p-3 text-xs text-emerald-700">
                      <p className="flex items-center gap-1.5"><ShieldCheck size={12} /> Aucun problème détecté — ce mot de passe est fort, unique et non compromis.</p>
                    </div>
                  )}
                  {(isPwned || isWeak || isMedium || isReused) && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-cream p-3">
                      <div>
                        <p className="mb-0.5 text-xs font-medium text-inktext">Plan d'action</p>
                        <p className="text-xs text-inktext-faint">Remplacez ce mot de passe par un mot de passe fort généré automatiquement.</p>
                      </div>
                      <button onClick={() => onFixEntry(e.id, generateStrong())}
                        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-deep">
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
