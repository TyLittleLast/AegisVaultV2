import { useEffect, useMemo, useState } from 'react'
import {
  Vault, KeyRound, HeartPulse, Settings, Lock, Plus, Search,
  ShieldCheck, ShieldAlert, AlertTriangle, Loader, Trash2,
  Star, ChevronLeft,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { checkPasswordBreach } from '../services/hibpService'
import ServiceLogo from './ServiceLogo'
import VaultDetailPanel from './VaultDetailPanel'
import GeneratorTab from './GeneratorTab'
import HealthTab from './HealthTab'
import SettingsTab from './SettingsTab'
import AddEntryModal from './AddEntryModal'
import { useIsMobile } from '../App'
import type { VaultEntry, AppSettings, VaultStore } from '../types/vault'

type NavTab = 'vault' | 'generator' | 'health' | 'settings'
type Filter = 'all' | 'favorites' | 'weak'
type MobileView = 'list' | 'detail'

interface MainLayoutProps {
  entries: VaultEntry[]
  decryptedPasswords: Record<string, string>
  isUnlocked: boolean
  settings: AppSettings
  vault: VaultStore | null
  onLock: () => void
  onAddEntry: (data: { service: string; url: string; username: string; password: string }) => void
  onDeleteEntry: (id: string) => void
  onFixEntry: (entryId: string, newPassword: string) => void
  onToggleFavorite: (id: string) => void
  onSettingsChange: (s: AppSettings) => void
  onReset: () => void
  onImport: (vault: VaultStore) => void
}

function getEntropy(password: string) {
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 32
  return pool > 0 ? Math.floor(password.length * Math.log2(pool)) : 0
}

function strengthMeta(entropy: number, isPwned?: boolean) {
  if (isPwned) return { label: 'Compromis', dot: 'bg-red-600' }
  if (entropy >= 80) return { label: 'Fort', dot: 'bg-green-600' }
  if (entropy >= 50) return { label: 'Moyen', dot: 'bg-amber-600' }
  return { label: 'Faible', dot: 'bg-red-600' }
}

function formatRelativeDate(isoDate?: string) {
  if (!isoDate) return '—'
  const diff = Date.now() - new Date(isoDate).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Auj.'
  if (days < 7) return `${days} j.`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} sem.`
  const months = Math.floor(days / 30)
  if (months < 13) return `${months} mois`
  return `${Math.floor(days / 365)} an`
}

function SummaryStat({
  icon: Icon, tone, label, value,
}: {
  icon: React.ElementType; tone: 'green' | 'red' | 'amber'; label: string; value: string
}) {
  const toneClass =
    tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-green-600'
  return (
    <div title={label} className="flex shrink-0 items-center gap-1">
      <Icon size={14} className={toneClass} />
      <span className={`text-[13px] font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function VaultRow({
  entry, password, isSelected, onSelect, onDelete,
}: {
  entry: VaultEntry
  password: string
  isSelected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [hibp, setHibp] = useState<{ isPwned: boolean; count: number } | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const entropy = getEntropy(password)
  const strength = strengthMeta(entropy, hibp?.isPwned)

  useEffect(() => {
    if (!password) return
    setChecking(true)
    checkPasswordBreach(password)
      .then(setHibp)
      .catch(() => setHibp(null))
      .finally(() => setChecking(false))
  }, [password])

  return (
    <div
      onClick={() => onSelect(entry.id)}
      className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150 ${
        isSelected ? 'bg-white shadow-sm' : 'hover:bg-white/70'
      }`}
    >
      <ServiceLogo service={entry.service} url={entry.url} size={32} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.service}</div>
        <div className="truncate text-xs text-inktext-faint">{entry.username}</div>
      </div>

      {entry.favorite && <Star size={13} className="text-peach" fill="#E8927C" />}

      {checking
        ? <Loader size={12} className="shrink-0 animate-spin text-inktext-faint" />
        : <span title={strength.label} className={`h-2 w-2 shrink-0 rounded-full ${strength.dot}`} />
      }

      <span className="hidden w-12 shrink-0 text-right text-[11.5px] text-inktext-faint sm:block">
        {formatRelativeDate(entry.updatedAt)}
      </span>

      {confirmingDelete ? (
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onDelete(entry.id)}
            className="cursor-pointer rounded-[7px] border-0 bg-red-600 px-2 py-1 text-[11.5px] font-semibold text-white"
          >✓</button>
          <button
            onClick={() => setConfirmingDelete(false)}
            className="cursor-pointer rounded-[7px] border border-border bg-transparent px-2 py-1 text-[11.5px] text-inktext-muted"
          >✕</button>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setConfirmingDelete(true) }}
          className="flex shrink-0 cursor-pointer border-0 bg-transparent p-1 text-inktext-faint opacity-0 transition-colors duration-150 hover:text-inktext group-hover:opacity-100"
          title="Supprimer"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

function BottomTabBar({
  activeTab,
  onTabChange,
  alertBadge,
  onLock,
}: {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
  alertBadge: number
  onLock: () => void
}) {
  const tabs: Array<{ id: NavTab; icon: React.ElementType; label: string }> = [
    { id: 'vault', icon: Vault, label: 'Coffre' },
    { id: 'generator', icon: KeyRound, label: 'Générer' },
    { id: 'health', icon: HeartPulse, label: 'Santé' },
    { id: 'settings', icon: Settings, label: 'Réglages' },
  ]
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border/70 bg-cream/90 pb-[env(safe-area-inset-bottom,8px)] backdrop-blur-md">
      {tabs.map(({ id, icon: Icon, label }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            className={`relative flex flex-1 flex-col items-center gap-1 border-0 bg-transparent px-2 py-2 text-[10px] font-medium tracking-[0.02em] transition-colors duration-150 ${active ? 'text-ink' : 'text-inktext-faint'}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
          >
            <div className={`relative flex h-8 w-10 items-center justify-center rounded-xl ${active ? 'bg-white shadow-sm' : ''}`}>
              <Icon size={18} strokeWidth={active ? 2 : 1.6} />
              {id === 'health' && alertBadge > 0 && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-600" />
              )}
            </div>
            <span>{label}</span>
          </button>
        )
      })}
      <button
        className="relative flex flex-1 flex-col items-center gap-1 border-0 bg-transparent px-4 py-2 text-[10px] font-medium tracking-[0.02em] text-inktext-faint"
        onClick={onLock}
        aria-label="Verrouiller"
      >
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg">
          <Lock size={20} strokeWidth={1.7} />
        </div>
        <span>Verrou</span>
      </button>
    </nav>
  )
}

export default function MainLayout({
  entries, decryptedPasswords, settings, vault,
  onLock, onAddEntry, onDeleteEntry, onFixEntry, onToggleFavorite, onSettingsChange, onReset, onImport,
}: MainLayoutProps) {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<NavTab>('vault')
  const [showModal, setShowModal] = useState(false)
  const [prefillPwd, setPrefillPwd] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [securitySummary, setSecuritySummary] = useState({ protectedCount: 0, compromisedCount: 0, reviewCount: 0 })
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('av-sidebar') !== 'closed'
  })

  function toggleSidebar() {
    setSidebarOpen(open => {
      const next = !open
      localStorage.setItem('av-sidebar', next ? 'open' : 'closed')
      return next
    })
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      const results = await Promise.all(entries.map(async entry => {
        const password = decryptedPasswords[entry.id] ?? ''
        const entropy = getEntropy(password)
        const weak = entropy < 80
        if (!password) return { compromised: false, weak: true }
        try { const b = await checkPasswordBreach(password); return { compromised: b.isPwned, weak } }
        catch { return { compromised: false, weak } }
      }))
      if (!active) return
      setSecuritySummary({
        protectedCount: results.filter(r => !r.compromised && !r.weak).length,
        compromisedCount: results.filter(r => r.compromised).length,
        reviewCount: results.filter(r => !r.compromised && r.weak).length,
      })
    }
    run()
    return () => { active = false }
  }, [entries, decryptedPasswords])

  const filtered = useMemo(() => {
    let list = entries
    if (filter === 'favorites') list = list.filter(e => e.favorite)
    if (filter === 'weak') list = list.filter(e => getEntropy(decryptedPasswords[e.id] ?? '') < 80)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(e => e.service.toLowerCase().includes(q) || e.username.toLowerCase().includes(q))
    return list
  }, [entries, decryptedPasswords, filter, query])

  const selectedEntry = selectedId ? entries.find(e => e.id === selectedId) ?? null : null
  const alertBadge = securitySummary.compromisedCount + securitySummary.reviewCount

  function selectItem(id: string) {
    setSelectedId(id)
    if (isMobile) setMobileView('detail')
  }

  function handleDelete(id: string) {
    if (selectedId === id) setSelectedId(null)
    onDeleteEntry(id)
  }

  function handleUsePassword(pwd: string) {
    setPrefillPwd(pwd)
    setActiveTab('vault')
    setShowModal(true)
  }

  function handleTabChange(tab: NavTab) {
    setActiveTab(tab)
    setFilter('all')
    if (isMobile) setMobileView('list')
  }

  const vaultContent = (
    <div className="flex min-h-0 flex-1 flex-col">
      {(!isMobile || mobileView === 'list') && (
        <>
          <div className="mb-4 flex items-center gap-3">
            {isMobile && <Vault size={18} strokeWidth={1.75} className="shrink-0 text-ink" />}
            <h1 className="m-0 shrink-0 text-xl font-semibold tracking-[-0.04em] md:text-[22px]">Coffre</h1>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Search size={16} className="shrink-0 text-inktext-faint" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="min-w-0 w-full border-0 bg-transparent py-1.5 text-sm text-inktext outline-none placeholder:text-inktext-faint"
              />
            </label>
            <button
              className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium text-ink shadow-sm transition-colors duration-150 hover:bg-white"
              onClick={() => { setPrefillPwd(''); setShowModal(true) }}
              aria-label="Ajouter"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Ajouter</span>
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {([
                { id: 'all',       label: 'Tous'     },
                { id: 'favorites', label: 'Favoris'  },
                { id: 'weak',      label: 'Faibles'  },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 cursor-pointer rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                    filter === f.id
                      ? 'bg-white text-ink shadow-sm'
                      : 'text-inktext-muted hover:bg-white/70 hover:text-inktext'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <SummaryStat icon={ShieldCheck} tone="green" label="Protégés" value={`${securitySummary.protectedCount}/${entries.length}`} />
              <SummaryStat icon={ShieldAlert} tone="red" label="Compromis" value={`${securitySummary.compromisedCount}`} />
              <SummaryStat icon={AlertTriangle} tone="amber" label="À revoir" value={`${securitySummary.reviewCount}`} />
            </div>
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1 gap-6">
        {(!isMobile || mobileView === 'list') && (
          <div className="scrollbar-thin flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {filtered.map(entry => (
              <VaultRow
                key={entry.id}
                entry={entry}
                password={decryptedPasswords[entry.id] ?? ''}
                isSelected={entry.id === selectedId}
                onSelect={selectItem}
                onDelete={handleDelete}
              />
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
                <Vault size={22} strokeWidth={1.5} className="mb-3 text-inktext-faint" />
                <p className="mb-1 text-sm font-medium text-inktext">
                  {entries.length === 0 ? 'Votre coffre est vide' : 'Aucun résultat'}
                </p>
                <p className="mb-4 max-w-xs text-sm text-inktext-faint">
                  {entries.length === 0
                    ? 'Ajoutez votre premier identifiant pour commencer.'
                    : 'Aucun identifiant ne correspond à votre recherche.'}
                </p>
                {entries.length === 0 && (
                  <button
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-sm"
                    onClick={() => setShowModal(true)}
                  >
                    <Plus size={15} /> Ajouter
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {(!isMobile || mobileView === 'detail') && (isMobile || entries.length > 0) && (
        <div className={`scrollbar-thin flex min-h-0 flex-col overflow-y-auto rounded-xl bg-white shadow-sm ${isMobile ? 'min-h-0 w-full flex-1' : 'w-[360px] shrink-0'}`}>
          {isMobile && selectedEntry && (
            <button
              onClick={() => setMobileView('list')}
              className="flex cursor-pointer items-center gap-1 border-0 bg-transparent px-5 pt-4 text-sm font-medium text-inktext-muted"
            >
              <ChevronLeft size={16} /> Retour
            </button>
          )}
          {selectedEntry ? (
            <VaultDetailPanel
              entry={selectedEntry}
              password={decryptedPasswords[selectedEntry.id] ?? ''}
              onDelete={handleDelete}
              onFixEntry={onFixEntry}
              onToggleFavorite={() => onToggleFavorite(selectedEntry.id)}
              onClose={isMobile ? undefined : () => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <p className="text-sm text-inktext-faint">Sélectionnez un identifiant</p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )

  const navItems: Array<{ id: NavTab; icon: React.ElementType; label: string; badge?: number }> = [
    { id: 'vault', icon: Vault, label: 'Coffre' },
    { id: 'generator', icon: KeyRound, label: 'Générateur' },
    { id: 'health', icon: HeartPulse, label: 'Santé', badge: alertBadge },
    { id: 'settings', icon: Settings, label: 'Réglages' },
  ]

  return (
    <div className="flex min-h-screen bg-cream font-sans text-inktext">

      {!isMobile && (
        <aside
          className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-border/70 bg-cream px-2.5 py-5 transition-[width] duration-200 ease-out ${
            sidebarOpen ? 'w-[212px]' : 'w-[64px]'
          }`}
        >
          <div className={`mb-8 flex items-center ${sidebarOpen ? 'gap-2.5 px-2' : 'justify-center'}`}>
            <Vault size={20} strokeWidth={1.75} className="shrink-0 text-ink" />
            {sidebarOpen && (
              <span className="truncate text-[15px] font-semibold tracking-[-0.03em]">AegisVault</span>
            )}
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map(({ id, icon: Icon, label, badge }) => {
              const active = activeTab === id
              return (
                <button
                  key={id}
                  title={sidebarOpen ? undefined : label}
                  onClick={() => handleTabChange(id)}
                  className={`relative flex w-full cursor-pointer items-center rounded-xl border-0 py-2 text-sm transition-colors duration-150 ${
                    sidebarOpen ? 'gap-3 px-2.5' : 'justify-center px-0'
                  } ${
                    active
                      ? 'bg-white text-ink shadow-sm'
                      : 'bg-transparent text-inktext-muted hover:bg-white/70 hover:text-inktext'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2 : 1.6} className="shrink-0" />
                  {sidebarOpen && <span className="flex-1 text-left">{label}</span>}
                  {!!badge && sidebarOpen && (
                    <span className="text-[11px] font-semibold text-red-600">{badge}</span>
                  )}
                  {!!badge && !sidebarOpen && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-600" />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="flex-1" />

          <div className="flex flex-col gap-1">
            <button
              onClick={onLock}
              title={sidebarOpen ? undefined : 'Verrouiller'}
              className={`flex w-full cursor-pointer items-center rounded-xl border-0 py-2 text-sm text-inktext-faint transition-colors duration-150 hover:bg-white/70 hover:text-inktext ${
                sidebarOpen ? 'gap-3 px-2.5' : 'justify-center px-0'
              }`}
            >
              <Lock size={18} strokeWidth={1.6} className="shrink-0" />
              {sidebarOpen && <span>Verrouiller</span>}
            </button>
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Réduire le menu' : 'Ouvrir le menu'}
              aria-label={sidebarOpen ? 'Réduire le menu' : 'Ouvrir le menu'}
              className={`flex w-full cursor-pointer items-center rounded-xl border-0 py-2 text-sm text-inktext-faint transition-colors duration-150 hover:bg-white/70 hover:text-inktext ${
                sidebarOpen ? 'gap-3 px-2.5' : 'justify-center px-0'
              }`}
            >
              {sidebarOpen ? <PanelLeftClose size={18} strokeWidth={1.6} className="shrink-0" /> : <PanelLeftOpen size={18} strokeWidth={1.6} />}
              {sidebarOpen && <span>Réduire</span>}
            </button>
          </div>
        </aside>
      )}

      <main className={`flex min-w-0 flex-1 flex-col ${isMobile ? 'px-4 pb-[calc(80px+env(safe-area-inset-bottom,0px))] pt-5' : 'px-8 py-7'}`}>

        {activeTab !== 'vault' && (
          <div className="mb-5 flex min-w-0 items-center gap-3">
            {isMobile && <Vault size={18} strokeWidth={1.75} className="shrink-0 text-ink" />}
            <h1 className="m-0 min-w-0 truncate text-xl font-semibold tracking-[-0.04em] md:text-[22px]">
              {{ vault: 'Coffre', generator: 'Générateur', health: 'Santé du coffre', settings: 'Réglages' }[activeTab]}
            </h1>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          {activeTab === 'vault' && vaultContent}
          {activeTab === 'generator' && (
            <div className="mx-auto w-full max-w-[680px] animate-fade">
              <GeneratorTab onUsePassword={handleUsePassword} />
            </div>
          )}
          {activeTab === 'health' && (
            <div className="mx-auto w-full max-w-[680px] animate-fade">
              <HealthTab entries={entries} decryptedPasswords={decryptedPasswords} onFixEntry={onFixEntry} />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="mx-auto w-full max-w-[680px] animate-fade">
              <SettingsTab settings={settings} vault={vault} onSettingsChange={onSettingsChange} onReset={onReset} onImport={onImport} />
            </div>
          )}
        </div>
      </main>

      {isMobile && (
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          alertBadge={alertBadge}
          onLock={onLock}
        />
      )}

      {showModal && <AddEntryModal prefillPassword={prefillPwd} onAdd={onAddEntry} onClose={() => setShowModal(false)} />}
    </div>
  )
}
