import { HardDrive, ShieldCheck, ShieldAlert, RefreshCw, Info } from 'lucide-react'
import type { PersistenceOutcome, StorageDurability } from '../services/storageService'

interface StorageCardProps {
  durability: StorageDurability | null
  /** True while a persist() request is in flight. */
  requesting: boolean
  /** Verdict of the last request, so a refusal can be explained. */
  persistOutcome: PersistenceOutcome
  onRequestPersist: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  const units = ['Ko', 'Mo', 'Go', 'To']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/**
 * Durability of the only copy of the vault.
 *
 * This is here rather than hidden in settings because it is the one fact about
 * storage a user can act on: the browser may evict this origin, and with no
 * server behind it there is nothing else holding the data. A refused persist()
 * is reported plainly instead of being swallowed, because a silent denial is
 * indistinguishable from data loss later on.
 */
export default function StorageCard({
  durability,
  requesting,
  persistOutcome,
  onRequestPersist,
}: StorageCardProps) {
  const persisted = durability?.persisted ?? false
  const { usageBytes, quotaBytes } = durability ?? { usageBytes: null, quotaBytes: null }
  const refused = !persisted && persistOutcome === 'refused'

  const ratio =
    usageBytes !== null && quotaBytes !== null && quotaBytes > 0
      ? Math.min(100, Math.max(0, (usageBytes / quotaBytes) * 100))
      : null

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {persisted ? (
            <ShieldCheck size={16} className="text-emerald-600" />
          ) : (
            <ShieldAlert size={16} className="text-amber-600" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="text-sm font-medium text-inktext">Stockage local</h2>
          <p className="text-xs leading-relaxed text-inktext-faint">
            {persisted
              ? 'Ce coffre est protégé contre l’éviction automatique par le navigateur.'
              : refused
                ? 'Le navigateur a refusé la persistance. Ce coffre peut donc être effacé s’il manque de place.'
                : 'Le navigateur peut effacer ce coffre s’il manque de place. Demandez la persistance, et exportez régulièrement une sauvegarde.'}
          </p>
        </div>
      </div>

      {/* A refusal replaces the button: asking again would only be refused
          again. What actually moves the needle is install or bookmark. */}
      {refused && (
        <p className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-[11.5px] leading-relaxed text-inktext-muted">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>
            Cette décision dépend de votre engagement, pas d’un réglage : installez AegisVault comme
            application, ou ajoutez cette page en favori. Le statut est revérifié à chaque retour
            sur l’onglet. En attendant, exportez une sauvegarde — c’est la seule copie hors de cette
            machine.
          </span>
        </p>
      )}

      {!persisted && !refused && (
        <button
          onClick={onRequestPersist}
          disabled={requesting}
          className="flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-cream px-3 py-1.5 text-xs text-inktext-muted transition-colors hover:text-inktext disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw size={12} className={requesting ? 'animate-spin' : ''} />
          {requesting ? 'Demande…' : 'Demander la persistance'}
        </button>
      )}

      {ratio !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11.5px] text-inktext-faint">
            <span className="flex items-center gap-1.5">
              <HardDrive size={12} /> Espace utilisé
            </span>
            <span className="tabular-nums">
              {formatBytes(usageBytes as number)} / {formatBytes(quotaBytes as number)}
            </span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-full bg-cream">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-300"
              style={{ width: `${Math.max(ratio, 0.5)}%` }}
            />
          </div>
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-inktext-faint">
        Installer l’application comme PWA rend ce stockage nettement plus durable sur mobile, où un
        onglet non installé peut être purgé après quelques jours d’inactivité.
      </p>
    </section>
  )
}
