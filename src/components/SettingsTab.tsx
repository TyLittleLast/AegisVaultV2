import { useState } from 'react'
import { Download, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { saveSettings, deleteVault } from '../services/storageService'
import type { AppSettings, VaultStore } from '../types/vault'

interface SettingsTabProps {
  settings: AppSettings
  vault: VaultStore | null
  onSettingsChange: (s: AppSettings) => void
  onReset: () => void
  onImport: (vault: VaultStore) => void
}

export default function SettingsTab({ settings, vault, onSettingsChange, onReset, onImport }: SettingsTabProps) {
  const [confirmReset, setConfirmReset] = useState(false)

  const handleAutoLock = async (minutes: number) => {
    const updated = { ...settings, autoLockMinutes: minutes }
    await saveSettings(updated)
    onSettingsChange(updated)
  }

  const handleExport = () => {
    if (!vault) return
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aegisvault-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string) as VaultStore
        if (!data.salt || !data.canary || !Array.isArray(data.entries)) throw new Error()
        onImport(data)
      } catch { alert('Fichier invalide ou corrompu.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleReset = async () => {
    await deleteVault()
    onReset()
  }

  return (
    <div className="mx-auto flex max-w-2xl animate-rise flex-col gap-5">
      <p className="text-sm text-inktext-muted">Gérez le verrouillage et les sauvegardes de votre coffre.</p>

      <div className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-inktext">Verrouillage automatique</p>
        <div className="flex flex-wrap gap-1.5">
          {[1, 5, 15, 30, 60].map(m => (
            <button key={m} onClick={() => handleAutoLock(m)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors ${
                settings.autoLockMinutes === m
                  ? 'bg-cream text-ink shadow-sm'
                  : 'text-inktext-muted hover:bg-cream/80 hover:text-inktext'
              }`}>
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-inktext">Sauvegarde chiffrée</p>
        <p className="text-xs text-inktext-faint">Le fichier exporté contient uniquement des données chiffrées. Le mot de passe maître est requis pour le restaurer.</p>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={!vault}
            className="flex items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm text-inktext-muted transition-colors hover:text-inktext disabled:opacity-30">
            <Download size={14} /> Exporter
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm text-inktext-muted transition-colors hover:text-inktext">
            <Upload size={14} /> Importer
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-inktext">
          <AlertTriangle size={16} />
          <p className="text-sm font-medium">Zone dangereuse</p>
        </div>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}
            className="flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm text-inktext-muted transition-colors hover:bg-cream hover:text-inktext">
            <Trash2 size={14} /> Réinitialiser le coffre
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-inktext-muted">Cette action est irréversible. Toutes les données seront supprimées.</p>
            <div className="flex gap-2">
              <button onClick={handleReset} className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-deep">
                Confirmer
              </button>
              <button onClick={() => setConfirmReset(false)} className="rounded-xl px-4 py-2 text-sm text-inktext-muted transition-colors hover:bg-cream hover:text-inktext">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
