import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'
import { copySecret } from '../utils/clipboard'
import {
  STRENGTH_THRESHOLDS,
  buildPool,
  generatePassword,
  poolEntropy,
  type GeneratorOptions,
} from '../utils/password'

interface GeneratorTabProps {
  onUsePassword?: (pwd: string) => void
}

/** `length` is driven by the slider, not by a toggle. */
type ToggleKey = Exclude<keyof GeneratorOptions, 'length'>

const OPTIONS: Array<{ key: ToggleKey; label: string }> = [
  { key: 'upper', label: 'Majuscules' },
  { key: 'lower', label: 'Minuscules' },
  { key: 'digits', label: 'Chiffres' },
  { key: 'symbols', label: 'Symboles' },
  { key: 'excludeAmbiguous', label: 'Exclure les caractères ambigus (I, O, l, 0, 1)' },
]

export default function GeneratorTab({ onUsePassword }: GeneratorTabProps) {
  const [length, setLength] = useState(20)
  const [opts, setOpts] = useState({
    upper: true,
    lower: true,
    digits: true,
    symbols: false,
    excludeAmbiguous: true,
  })
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)

  const effective = useMemo<GeneratorOptions>(() => ({ ...opts, length }), [opts, length])
  const poolSize = useMemo(() => buildPool(effective).length, [effective])
  const bits = useMemo(() => poolEntropy(effective), [effective])

  const regenerate = useCallback(() => {
    if (poolSize === 0) return
    setPassword(generatePassword(effective))
    setCopied(false)
  }, [effective, poolSize])

  // Keep a candidate on screen whenever the parameters change, so the readout
  // is never stale relative to the controls.
  useEffect(() => {
    if (poolSize > 0) setPassword(generatePassword(effective))
  }, [effective, poolSize])

  const barColor =
    bits < STRENGTH_THRESHOLDS.medium
      ? 'bg-red-600'
      : bits < STRENGTH_THRESHOLDS.strong
        ? 'bg-amber-600'
        : 'bg-emerald-600'
  const textColor =
    bits < STRENGTH_THRESHOLDS.medium
      ? 'text-red-600'
      : bits < STRENGTH_THRESHOLDS.strong
        ? 'text-amber-600'
        : 'text-emerald-600'
  const label =
    bits < STRENGTH_THRESHOLDS.medium ? 'Faible' : bits < STRENGTH_THRESHOLDS.strong ? 'Moyen' : 'Fort'

  async function handleCopy() {
    if (!password) return
    const ok = await copySecret(password)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto flex max-w-2xl animate-rise flex-col gap-5">
      <p className="text-sm text-inktext-muted">
        Généré localement avec crypto.getRandomValues, via un tirage uniforme sans biais.
      </p>

      <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-4 shadow-sm">
        <span className="flex-1 break-all font-mono text-sm text-inktext/80">
          {password || <span className="text-inktext-faint">—</span>}
        </span>
        <button
          onClick={regenerate}
          disabled={poolSize === 0}
          className="cursor-pointer rounded-lg p-1 text-inktext-faint transition-colors hover:bg-cream hover:text-inktext disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Régénérer"
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={() => void handleCopy()}
          disabled={!password}
          className="cursor-pointer rounded-lg p-1 text-inktext-faint transition-colors hover:bg-cream hover:text-inktext disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Copier le mot de passe"
        >
          {copied ? <Check size={16} className="text-inktext" /> : <Copy size={16} />}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-inktext-muted">
          <span>Entropie du jeu de caractères</span>
          <span className={textColor}>
            {bits} bits — {label}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white shadow-sm">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.min((bits / 128) * 100, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm text-inktext-muted">
          <label htmlFor="gen-length">Longueur</label>
          <span className="font-medium text-inktext">{length}</span>
        </div>
        <input
          id="gen-length"
          type="range"
          min={8}
          max={64}
          value={length}
          onChange={(e) => setLength(Number(e.target.value))}
          className="w-full accent-[#111111]"
        />
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-white p-2 shadow-sm">
        {OPTIONS.map(({ key, label: optionLabel }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-cream/80"
          >
            <span className="text-sm text-inktext-muted">{optionLabel}</span>
            <button
              type="button"
              role="switch"
              aria-checked={opts[key]}
              aria-label={optionLabel}
              onClick={() => setOpts((o) => ({ ...o, [key]: !o[key] }))}
              className={`relative h-5 w-10 cursor-pointer rounded-full border-0 transition-colors ${
                opts[key] ? 'bg-ink' : 'bg-ink-light'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                  opts[key] ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {poolSize === 0 && (
        <p className="text-xs text-red-600">
          Activez au moins une catégorie de caractères pour générer un mot de passe.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={regenerate}
          disabled={poolSize === 0}
          className="flex-1 cursor-pointer rounded-xl bg-ink py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          Générer
        </button>
        {onUsePassword && password && (
          <button
            onClick={() => onUsePassword(password)}
            className="flex-1 cursor-pointer rounded-xl bg-white py-2.5 text-sm font-medium text-inktext-muted shadow-sm transition-colors hover:text-inktext"
          >
            Enregistrer dans le coffre
          </button>
        )}
      </div>
    </div>
  )
}