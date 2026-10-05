import { brandTint, resolveBrand } from '../data/brandIcons'

const TONES = [
  'bg-[#F3E3DA] text-[#8A4B32]',
  'bg-[#E3EAF2] text-[#33506B]',
  'bg-[#E6EFE2] text-[#3F6134]',
  'bg-[#F1E9D8] text-[#6B5320]',
  'bg-[#EAE4F0] text-[#4B3A63]',
] as const

/** FNV-1a: stable tone per service so an entry always looks the same. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function initials(label: string): string {
  const words = label
    .split(/[\s.\-_]+/)
    .map((w) => w.trim())
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}

/**
 * Service avatar rendered entirely from the entry's own name.
 *
 * Deliberately does not fetch a favicon: doing so would disclose every stored
 * service to a third party on every render, which would contradict the
 * zero-knowledge claim. The brand marks are the same SVG paths shipped in the
 * bundle, matched against the label offline. Purely decorative.
 */
export default function ServiceAvatar({ label, size = 40 }: { label: string; size?: number }) {
  const brand = resolveBrand(label)

  if (brand) {
    const glyph = Math.round(size * 0.58)
    return (
      <div
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-xl"
        style={{ width: size, height: size, backgroundColor: brandTint(brand.color) }}
      >
        <svg width={glyph} height={glyph} viewBox={brand.viewBox} role="presentation">
          <path fill={brand.color} d={brand.path} />
        </svg>
      </div>
    )
  }

  const tone = TONES[hash(label) % TONES.length]!
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl font-semibold tracking-tight ${tone}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(label)}
    </div>
  )
}
