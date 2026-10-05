import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Vault,
  KeyRound,
  HeartPulse,
  Settings,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  Star,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import ServiceAvatar from './ServiceAvatar'
import SearchField from './SearchField'
import VaultDetailPanel from './VaultDetailPanel'
import GeneratorTab from './GeneratorTab'
import HealthTab from './HealthTab'
import SettingsTab from './SettingsTab'
import AddEntryModal from './AddEntryModal'
import { useIsMobile } from '../hooks/useIsMobile'
import { STRENGTH_THRESHOLDS, grade } from '../utils/password'
import type { PersistenceOutcome, StorageDurability } from '../services/storageService'
import type {
  AppSettings,
  EntryInput,
  EntrySearchMeta,
  VaultEntry,
  VaultStore,
} from '../types/vault'

type NavTab = 'vault' | 'generator' | 'health' | 'settings'
type Filter = 'all' | 'favorites' | 'weak'
type MobileView = 'list' | 'detail'

interface MainLayoutProps {
  vault: VaultStore | null
  searchIndex: Record<string, EntrySearchMeta>
  settings: AppSettings
  onLock: () => void
  onAddEntry: (input: EntryInput) => void | Promise<void>
  onDeleteEntry: (id: string) => void | Promise<void>
  onFixEntry: (entryId: string) => void | Promise<void>
  onToggleFavorite: (id: string) => void | Promise<void>
  onSettingsChange: (s: AppSettings) => void | Promise<void>
  onChangeMasterPassword: (currentPwd: string, newPwd: string) => Promise<void>
  onReset: () => void | Promise<void>
  onImport: (store: VaultStore) => void | Promise<void>
  onRevealSecrets: (entryId: string) => Promise<{ password: string; url: string }>
  onRevealAll: () => Promise<Record<string, string>>
  durability: StorageDurability | null
  requestingPersist: boolean
  persistOutcome: PersistenceOutcome
  onRequestPersist: () => void
}

function formatRelativeDate(isoDate?: string): string {
  if (!isoDate) return '—'
  const parsed = Date.parse(isoDate)
  if (Number.isNaN(parsed)) return '—'
  const diff = Date.now() - parsed
  const days = Math.floor(diff / 86_400_000)
  if (days < 0) return 'À venir'
  if (days === 0) return 'Auj.'
  if (days < 7) return `${days} j.`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} sem.`
  const months = Math.floor(days / 30)
  if (months < 13) return `${months} mois`
  return `${Math.floor(days / 365)} an`
}

function SummaryStat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: React.ElementType
  tone: 'green' | 'amber'
  label: string
  value: string
}) {
  const toneClass = tone === 'amber' ? 'text-amber-600' : 'text-emerald-600'
  return (
    <div title={label} className="flex shrink-0 items-center gap-1">
      <Icon size={14} className={toneClass} />
      <span className={`text-[13px] font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function VaultRow({
  entry,
  meta,
  isSelected,
  onSelect,
  onDelete,
}: {
  entry: VaultEntry
  meta: EntrySearchMeta | undefined
  isSelected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const strength = grade(entry.entropy ?? 0)

  return (
    <div
      onClick={() => onSelect(entry.id)}
      className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150 ${
        isSelected ? 'bg-white shadow-card' : 'hover:bg-white/70'
      }`}
    >
      <ServiceAvatar label={meta?.service ?? entry.id} size={32} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{meta?.service ?? 'Entrée illisible'}</div>
        <div className="truncate text-xs text-inktext-faint">{meta?.username ?? '—'}</div>
      </div>

      {entry.favorite && <Star size={13} className="text-peach" fill="#E8927C" />}

      <span
        title={`Entropie : ${strength.label}`}
        className={`h-2 w-2 shrink-0 rounded-full ${strength.bar}`}
      />

      <span className="hidden w-12 shrink-0 text-right text-[11.5px] text-inktext-faint sm:block">
        {formatRelativeDate(entry.updatedAt)}
      </span>

      {confirmingDelete ? (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(entry.id)}
            className="cursor-pointer rounded-[7px] border-0 bg-red-600 px-2 py-1 text-[11.5px] font-semibold text-white"
            aria-label="Confirmer la suppression"
          >
            ✓
          </button>
          <button
            onClick={() => setConfirmingDelete(false)}
            className="cursor-pointer rounded-[7px] border border-border bg-transparent px-2 py-1 text-[11.5px] text-inktext-muted"
            aria-label="Annuler"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setConfirmingDelete(true)
          }}
          className="flex shrink-0 cursor-pointer border-0 bg-transparent p-1 text-inktext-faint opacity-0 transition-colors duration-150 hover:text-inktext group-hover:opacity-100 focus-visible:opacity-100"
          title="Supprimer"
          aria-label={`Supprimer ${meta?.service ?? 'l’entrée'}`}
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
  onLock,
}: {
  activeTab: NavTab
  onTabChange: (tab: NavTab) => void
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
            aria-current={active ? 'page' : undefined}
          >
            <div
              className={`relative flex h-8 w-10 items-center justify-center rounded-xl ${active ? 'bg-white shadow-card' : ''}`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.6} />
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
  vault,
  searchIndex,
  settings,
  onLock,
  onAddEntry,
  onDeleteEntry,
  onFixEntry,
  onToggleFavorite,
  onSettingsChange,
  onChangeMasterPassword,
  onReset,
  onImport,
  onRevealSecrets,
  onRevealAll,
  durability,
  requestingPersist,
  persistOutcome,
  onRequestPersist,
}: MainLayoutProps) {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<NavTab>('vault')
  const [showModal, setShowModal] = useState(false)
  const [prefillPwd, setPrefillPwd] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus has to wait for the expanding element to exist, otherwise the caret
  // lands nowhere.
  const openSearch = useCallback(() => {
    setSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const closeSearch = useCallback(() => setSearchOpen(false), [])

  // Ctrl/Cmd+K from anywhere, the convention every list-based tool shares.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (searchOpen) closeSearch()
        else openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen, openSearch, closeSearch])
  const [filter, setFilter] = useState<Filter>('all')
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('av-sidebar') !== 'closed'
  })

  const entries = useMemo(() => vault?.entries ?? [], [vault])

  /**
   * Strength counts come from the cleartext `entropy` field stored alongside
   * each entry, so rendering the list decrypts nothing and issues no request.
   * Breach status is only known after the explicit audit in the Health tab.
   */
  const strengthCounts = useMemo(() => {
    let protectedCount = 0
    for (const entry of entries) {
      if ((entry.entropy ?? 0) >= STRENGTH_THRESHOLDS.strong) protectedCount++
    }
    return { protectedCount, reviewCount: entries.length - protectedCount }
  }, [entries])

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      localStorage.setItem('av-sidebar', next ? 'open' : 'closed')
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = entries
    if (filter === 'favorites') list = list.filter((e) => e.favorite)
    if (filter === 'weak') {
      list = list.filter((e) => (e.entropy ?? 0) < STRENGTH_THRESHOLDS.strong)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const meta = searchIndex[e.id]
        return meta?.service.toLowerCase().includes(q) || meta?.username.toLowerCase().includes(q)
      })
    }
    return list
  }, [entries, searchIndex, filter, query])

  const selectedEntry = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null

  function selectItem(id: string) {
    setSelectedId(id)
    if (isMobile) setMobileView('detail')
  }

  function handleDelete(id: string) {
    if (selectedId === id) setSelectedId(null)
    void onDeleteEntry(id)
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
            <h1 className="m-0 shrink-0 text-xl font-semibold tracking-[-0.04em] md:text-[22px]">
              Coffre
            </h1>

            {/* Desktop: unfolds into the gap between the title and the buttons.
                The grid-template-columns transition is the only reliable way to
                animate to an intrinsic width without measuring anything. */}
            {!isMobile && (
              <div
                className={`grid min-w-0 flex-1 justify-end transition-[grid-template-columns] duration-200 ease-out ${
                  searchOpen ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'
                }`}
              >
                <div className="overflow-hidden">
                  <SearchField
                    ref={searchInputRef}
                    value={query}
                    onChange={setQuery}
                    onClose={closeSearch}
                    inactive={!searchOpen}
                  />
                </div>
              </div>
            )}

            {/* Hidden while open: the field carries the search icon itself, and
                two magnifiers side by side read as a mistake. */}
            {!searchOpen && (
              <button
                onClick={openSearch}
                aria-label="Rechercher"
                aria-expanded={false}
                className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-inktext-muted transition-colors duration-150 hover:bg-white hover:text-ink"
              >
                <Search size={16} />
                {query && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-ink" />
                )}
              </button>
            )}

            <button
              className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-medium text-ink shadow-card transition-colors duration-150 hover:bg-white"
              onClick={() => {
                setPrefillPwd('')
                setShowModal(true)
              }}
              aria-label="Ajouter une entrée"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Ajouter</span>
            </button>
          </div>

          {/* Mobile: a full-width row beats an unfold that would push the
              buttons off-screen. */}
          {isMobile && searchOpen && (
            <div className="mb-3">
              <SearchField
                ref={searchInputRef}
                value={query}
                onChange={setQuery}
                onClose={closeSearch}
              />
            </div>
          )}

          <div className="mb-4 flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'favorites', label: 'Favoris' },
                  { id: 'weak', label: 'Faibles' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 cursor-pointer rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                    filter === f.id
                      ? 'bg-white text-ink shadow-card'
                      : 'text-inktext-muted hover:bg-white/70 hover:text-inktext'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <SummaryStat
                icon={ShieldCheck}
                tone="green"
                label="Robustes (80 bits ou plus)"
                value={`${strengthCounts.protectedCount}/${entries.length}`}
              />
              <SummaryStat
                icon={AlertTriangle}
                tone="amber"
                label="À renforcer"
                value={`${strengthCounts.reviewCount}`}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex min-h-0 flex-1 gap-6">
        {(!isMobile || mobileView === 'list') && (
          <div className="scrollbar-thin flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {filtered.map((entry) => (
              <VaultRow
                key={entry.id}
                entry={entry}
                meta={searchIndex[entry.id]}
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
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-ink shadow-card"
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
          <div
            className={`scrollbar-thin flex min-h-0 flex-col overflow-y-auto rounded-xl bg-white shadow-card ${isMobile ? 'min-h-0 w-full flex-1' : 'w-[360px] shrink-0'}`}
          >
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
                key={selectedEntry.id}
                entry={selectedEntry}
                meta={searchIndex[selectedEntry.id]}
                revealSecrets={onRevealSecrets}
                hibpEnabled={settings.hibpEnabled}
                onDelete={handleDelete}
                onFixEntry={onFixEntry}
                onToggleFavorite={() => void onToggleFavorite(selectedEntry.id)}
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
    { id: 'health', icon: HeartPulse, label: 'Santé' },
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
          <div
            className={`mb-8 flex items-center ${sidebarOpen ? 'gap-2.5 px-2' : 'justify-center'}`}
          >
            <Vault size={20} strokeWidth={1.75} className="shrink-0 text-ink" />
            {sidebarOpen && (
              <span className="truncate text-[15px] font-semibold tracking-[-0.03em]">
                AegisVault
              </span>
            )}
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map(({ id, icon: Icon, label }) => {
              const active = activeTab === id
              return (
                <button
                  key={id}
                  title={sidebarOpen ? undefined : label}
                  onClick={() => handleTabChange(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex w-full cursor-pointer items-center rounded-xl border-0 py-2 text-sm transition-colors duration-150 ${
                    sidebarOpen ? 'gap-3 px-2.5' : 'justify-center px-0'
                  } ${
                    active
                      ? 'bg-white text-ink shadow-card'
                      : 'bg-transparent text-inktext-muted hover:bg-white/70 hover:text-inktext'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2 : 1.6} className="shrink-0" />
                  {sidebarOpen && <span className="flex-1 text-left">{label}</span>}
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
              aria-expanded={sidebarOpen}
              className={`flex w-full cursor-pointer items-center rounded-xl border-0 py-2 text-sm text-inktext-faint transition-colors duration-150 hover:bg-white/70 hover:text-inktext ${
                sidebarOpen ? 'gap-3 px-2.5' : 'justify-center px-0'
              }`}
            >
              {sidebarOpen ? (
                <PanelLeftClose size={18} strokeWidth={1.6} className="shrink-0" />
              ) : (
                <PanelLeftOpen size={18} strokeWidth={1.6} className="shrink-0" />
              )}
              {sidebarOpen && <span>Réduire</span>}
            </button>
          </div>
        </aside>
      )}

      <main
        className={`flex min-w-0 flex-1 flex-col ${isMobile ? 'px-4 pb-[calc(80px+env(safe-area-inset-bottom,0px))] pt-5' : 'px-8 py-7'}`}
      >
        {activeTab !== 'vault' && (
          <div className="mb-5 flex min-w-0 items-center gap-3">
            {isMobile && <Vault size={18} strokeWidth={1.75} className="shrink-0 text-ink" />}
            <h1 className="m-0 min-w-0 truncate text-xl font-semibold tracking-[-0.04em] md:text-[22px]">
              {
                {
                  vault: 'Coffre',
                  generator: 'Générateur',
                  health: 'Santé du coffre',
                  settings: 'Réglages',
                }[activeTab]
              }
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
              <HealthTab
                entries={entries}
                searchIndex={searchIndex}
                hibpEnabled={settings.hibpEnabled}
                revealAll={onRevealAll}
                onFixEntry={onFixEntry}
                durability={durability}
                requestingPersist={requestingPersist}
                persistOutcome={persistOutcome}
                onRequestPersist={onRequestPersist}
              />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="mx-auto w-full max-w-[680px] animate-fade">
              <SettingsTab
                settings={settings}
                vault={vault}
                onSettingsChange={onSettingsChange}
                onChangeMasterPassword={onChangeMasterPassword}
                onReset={onReset}
                onImport={onImport}
              />
            </div>
          )}
        </div>
      </main>

      {isMobile && (
        <BottomTabBar activeTab={activeTab} onTabChange={handleTabChange} onLock={onLock} />
      )}

      {showModal && (
        <AddEntryModal
          prefillPassword={prefillPwd}
          onAdd={(input) => {
            void onAddEntry(input)
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
