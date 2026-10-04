import { useRef, useState } from 'react'
import { Download, Upload, Trash2, AlertTriangle, ShieldCheck, Globe, KeyRound } from 'lucide-react'
import { isVaultStore } from '../services/vaultSchema'
import { STRENGTH_THRESHOLDS, entropy as calcEntropy } from '../utils/password'
import type { AppSettings, VaultStore } from '../types/vault'

interface SettingsTabProps {
  settings: AppSettings
  vault: VaultStore | null
  onSettingsChange: (s: AppSettings) => void | Promise<void>
  onChangeMasterPassword: (currentPwd: string, newPwd: string) => Promise<void>
  onReset: () => void | Promise<void>
  onImport: (store: VaultStore) => void | Promise<void>
}

const AUTO_LOCK_CHOICES = [1, 5, 15, 30, 60] as const

export default function SettingsTab({
  settings,
  vault,
  onSettingsChange,
  onChangeMasterPassword,
  onReset,
  onImport,
}: SettingsTabProps) {
  const [confirmReset, setConfirmReset] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [rotateError, setRotateError] = useState<string | null>(null)
  const [rotateDone, setRotateDone] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const newBits = calcEntropy(newPwd)
  const newPwdStrong = newPwd.length >= 8 && newBits >= STRENGTH_THRESHOLDS.medium

  async function update(patch: Partial<AppSettings>) {
    await onSettingsChange({ ...settings, ...patch })
  }

  async function handleRotate() {
    setRotateError(null)
    if (newPwd !== confirmPwd) {
      setRotateError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setRotating(true)
    try {
      await onChangeMasterPassword(currentPwd, newPwd)
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
      setRotateDone(true)
    } catch (err: unknown) {
      setRotateError(err instanceof Error ? err.message : 'Rotation impossible.')
    } finally {
      setRotating(false)
    }
  }

  function handleExport() {
    if (!vault) return
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aegisvault-coffre-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    setImportError(null)
    try {
      const text = await file.text()
      const parsed: unknown = JSON.parse(text)
      if (!isVaultStore(parsed)) {
        throw new Error(
          'Ce fichier n’est pas un coffre AegisVault valide (format ou données corrompues).',
        )
      }
      await onImport(parsed)
    } catch (err: unknown) {
      setImportError(
        err instanceof Error ? err.message : 'Fichier illisible ou format non reconnu.',
      )
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl animate-rise flex-col gap-5">
      <p className="text-sm text-inktext-muted">
        Gérez le verrouillage, la vérification des fuites et les sauvegardes de votre coffre.
      </p>

      <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
        <h2 className="text-sm font-medium text-inktext">Verrouillage automatique</h2>
        <p className="text-xs leading-relaxed text-inktext-faint">
          Le coffre se reverrouille après une période d&apos;inactivité réelle : le délai est réarmé
          à chaque interaction, pas au déverrouillage.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {AUTO_LOCK_CHOICES.map((m) => (
            <button
              key={m}
              onClick={() => void update({ autoLockMinutes: m })}
              className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-medium transition-colors ${
                settings.autoLockMinutes === m
                  ? 'bg-cream text-ink shadow-card'
                  : 'text-inktext-muted hover:bg-cream/80 hover:text-inktext'
              }`}
            >
              {m} min
            </button>
          ))}
        </div>

        <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-xl bg-cream/70 px-3 py-2.5">
          <input
            type="checkbox"
            checked={settings.lockOnBlur}
            onChange={(e) => void update({ lockOnBlur: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#111111]"
          />
          <span>
            <span className="block text-[13px] font-medium text-inktext">
              Verrouiller dès que la fenêtre perd le focus
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-inktext-faint">
              Recommandé sur un ordinateur partagé : le coffre se reverrouille quand vous changez
              d&apos;application ou d&apos;onglet.
            </span>
          </span>
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-medium text-inktext">
          <Globe size={15} className="text-inktext-muted" />
          Réseau
        </h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cream/70 px-3 py-2.5">
          <input
            type="checkbox"
            checked={settings.hibpEnabled}
            onChange={(e) => void update({ hibpEnabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#111111]"
          />
          <span>
            <span className="block text-[13px] font-medium text-inktext">
              Vérifier les mots de passe contre les fuites connues
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-inktext-faint">
              Désactivé par défaut. Tant qu&apos;il reste désactivé, AegisVault n&apos;effectue
              aucune requête réseau. Quand vous l&apos;activez, seule une empreinte SHA-1 tronquée à
              5 caractères est envoyée à api.pwnedpasswords.com ; le mot de passe et son empreinte
              complète ne quittent jamais l&apos;appareil.
            </span>
          </span>
        </label>
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <span>
            Aucune police, aucune icône, aucun script n&apos;est chargé depuis un tiers. Le coffre
            ne dépend d&apos;aucun serveur : il fonctionne hors ligne.
          </span>
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
        <h2 className="text-sm font-medium text-inktext">Sauvegarde chiffrée</h2>
        <p className="text-xs leading-relaxed text-inktext-faint">
          Le fichier exporté ne contient que des données chiffrées. Le mot de passe maître reste
          nécessaire pour le restaurer — et pour y accéder sur un autre appareil.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            disabled={!vault}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm text-inktext-muted transition-colors hover:text-inktext disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Download size={14} /> Exporter
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm text-inktext-muted transition-colors hover:text-inktext"
          >
            <Upload size={14} /> Importer
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void handleImportFile(file)
            }}
          />
        </div>
        {importError && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
            {importError}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-sm font-medium text-inktext">
          <KeyRound size={15} className="text-inktext-muted" />
          Changer le mot de passe maître
        </h2>
        <p className="text-xs leading-relaxed text-inktext-faint">
          Chaque champ du coffre est déchiffré puis re-chiffré avec une nouvelle clé et un nouveau
          sel, entièrement sur cet appareil. À utiliser si vous pensez que l&apos;ordinateur ou le
          mot de passe actuel ont pu être compromis.
        </p>

        {rotateDone ? (
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <span>Mot de passe maître mis à jour. Le coffre est re-chiffré.</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Mot de passe actuel"
                autoComplete="current-password"
                aria-label="Mot de passe maître actuel"
                className="cursor-text rounded-xl bg-cream px-3 py-2 text-sm outline-none placeholder:text-inktext-faint"
              />
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Nouveau mot de passe (8 caractères min.)"
                autoComplete="new-password"
                aria-label="Nouveau mot de passe maître"
                className="cursor-text rounded-xl bg-cream px-3 py-2 text-sm outline-none placeholder:text-inktext-faint"
              />
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Confirmer le nouveau mot de passe"
                autoComplete="new-password"
                aria-label="Confirmer le nouveau mot de passe maître"
                className="cursor-text rounded-xl bg-cream px-3 py-2 text-sm outline-none placeholder:text-inktext-faint"
              />
            </div>

            {newPwd && !newPwdStrong && (
              <p className="text-xs text-amber-700">
                Recommandé : au moins 8 caractères et une entropie supérieure à{' '}
                {STRENGTH_THRESHOLDS.medium} bits (actuellement {newBits}).
              </p>
            )}
            {rotateError && (
              <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
                {rotateError}
              </p>
            )}

            <button
              onClick={() => void handleRotate()}
              disabled={rotating || !currentPwd || !newPwd || !newPwdStrong}
              className="flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-cream px-4 py-2 text-sm text-inktext-muted transition-colors hover:text-inktext disabled:cursor-not-allowed disabled:opacity-40"
            >
              {rotating ? 'Re-chiffrement…' : 'Changer le mot de passe maître'}
            </button>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-inktext">
          <AlertTriangle size={16} />
          <span className="text-sm font-medium">Zone dangereuse</span>
        </h2>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex w-fit cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-inktext-muted transition-colors hover:bg-cream hover:text-inktext"
          >
            <Trash2 size={14} /> Réinitialiser le coffre
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-inktext-muted">
              Cette action est irréversible. Exportez d&apos;abord une sauvegarde si vous avez un
              doute — elle reste lisible avec votre mot de passe maître actuel.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => void onReset()}
                className="cursor-pointer rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-deep"
              >
                Confirmer
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="cursor-pointer rounded-xl px-4 py-2 text-sm text-inktext-muted transition-colors hover:bg-cream hover:text-inktext"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
