import { useState, useCallback } from 'react'
import { Copy, Check, RefreshCw } from 'lucide-react'

const CHARS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghjkmnpqrstuvwxyz',
  digits: '23456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
  upperFull: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowerFull: 'abcdefghijklmnopqrstuvwxyz',
  digitsFull: '0123456789',
}

interface GeneratorTabProps {
  onUsePassword?: (pwd: string) => void
}

export default function GeneratorTab({ onUsePassword }: GeneratorTabProps) {
  const [length, setLength] = useState(20)
  const [opts, setOpts] = useState({ upper: true, lower: true, digits: true, symbols: false, noAmbiguous: true })
  const [password, setPassword] = useState('')
  const [copied, setCopied] = useState(false)

  const toggle = (k: keyof typeof opts) => setOpts(o => ({ ...o, [k]: !o[k] }))

  const generate = useCallback(() => {
    let pool = ''
    if (opts.upper) pool += opts.noAmbiguous ? CHARS.upper : CHARS.upperFull
    if (opts.lower) pool += opts.noAmbiguous ? CHARS.lower : CHARS.lowerFull
    if (opts.digits) pool += opts.noAmbiguous ? CHARS.digits : CHARS.digitsFull
    if (opts.symbols) pool += CHARS.symbols
    if (!pool) return
    const arr = crypto.getRandomValues(new Uint32Array(length))
    setPassword(Array.from(arr, n => pool[n % pool.length]).join(''))
    setCopied(false)
  }, [length, opts])

  const entropy = Math.floor(length * Math.log2(
    (opts.upper ? (opts.noAmbiguous ? CHARS.upper : CHARS.upperFull).length : 0) +
    (opts.lower ? (opts.noAmbiguous ? CHARS.lower : CHARS.lowerFull).length : 0) +
    (opts.digits ? (opts.noAmbiguous ? CHARS.digits : CHARS.digitsFull).length : 0) +
    (opts.symbols ? CHARS.symbols.length : 0) || 1
  ))

  const entropyBarColor = entropy < 50 ? 'bg-red-500' : entropy < 80 ? 'bg-orange-400' : 'bg-emerald-500'
  const entropyTextColor = entropy < 50 ? 'text-red-500' : entropy < 80 ? 'text-orange-500' : 'text-emerald-600'
  const entropyLabel = entropy < 50 ? 'Faible' : entropy < 80 ? 'Moyen' : 'Fort'

  const handleCopy = async () => {
    if (!password) return
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const SWITCHES: { key: keyof typeof opts; label: string }[] = [
    { key: 'upper',       label: 'Majuscules' },
    { key: 'lower',       label: 'Minuscules' },
    { key: 'digits',      label: 'Chiffres' },
    { key: 'symbols',     label: 'Symboles' },
    { key: 'noAmbiguous', label: 'Exclure ambigus (0, O, 1, l)' },
  ]

  return (
    <div className="mx-auto flex max-w-2xl animate-rise flex-col gap-5">
      <p className="text-sm text-inktext-muted">Créez une clé unique pour protéger un nouveau compte.</p>

      <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-4 shadow-sm">
        <span className="flex-1 break-all font-mono text-sm text-inktext/80">{password || <span className="text-inktext-faint">—</span>}</span>
        <button onClick={generate} className="rounded-lg p-1 text-inktext-faint transition-colors hover:bg-white hover:text-inktext"><RefreshCw size={16} /></button>
        <button onClick={handleCopy} className="rounded-lg p-1 text-inktext-faint transition-colors hover:text-inktext">
          {copied ? <Check size={16} className="text-inktext" /> : <Copy size={16} />}
        </button>
      </div>

      {password && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-inktext-muted">
            <span>Entropie</span>
            <span className={entropyTextColor}>{entropy} bits — {entropyLabel}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white shadow-sm">
            <div className={`h-full rounded-full transition-all ${entropyBarColor}`} style={{ width: `${Math.min((entropy / 128) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm text-inktext-muted">
          <span>Longueur</span><span className="font-medium text-inktext">{length}</span>
        </div>
        <input type="range" min={8} max={64} value={length}
          onChange={e => setLength(+e.target.value)}
          className="w-full accent-ink" />
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-white p-2 shadow-sm">
        {SWITCHES.map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 hover:bg-cream/80">
            <span className="text-sm text-inktext-muted">{label}</span>
            <div onClick={() => toggle(key)}
              className={`relative h-5 w-10 cursor-pointer rounded-full transition-colors ${opts[key] ? 'bg-ink' : 'bg-ink-light'}`}>
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${opts[key] ? 'left-5' : 'left-0.5'}`} />
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={generate}
          className="flex-1 rounded-xl bg-ink py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-deep">
          Générer
        </button>
        {onUsePassword && password && (
          <button onClick={() => onUsePassword(password)}
            className="flex-1 rounded-xl bg-white py-2.5 text-sm font-medium text-inktext-muted shadow-sm transition-colors hover:text-inktext">
            Utiliser
          </button>
        )}
      </div>
    </div>
  )
}
