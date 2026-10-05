import { BRAND_MARKS } from './brandIcons.generated'

export interface ResolvedBrand {
  slug: string
  /** '#RRGGBB' */
  color: string
  viewBox: string
  path: string
}

/** Lowercase, accent-free, space-separated words. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Alias index, longest wins. The `1000 +` offset on an exact hit keeps
 * "Proton Mail" on the mail brand rather than the generic Proton one, even
 * though both aliases match the same label.
 */
const ALIASES: ReadonlyArray<{ brand: ResolvedBrand; alias: string }> = Object.entries(
  BRAND_MARKS,
).flatMap(([slug, mark]) =>
  mark.aliases.map((alias) => ({
    brand: {
      slug,
      color: `#${mark.hex}`,
      viewBox: mark.viewBox,
      path: mark.path,
    },
    alias: normalize(alias),
  })),
)

/**
 * Resolves a free-text service label to a brand mark, or null when nothing
 * matches and the caller should fall back to a monogram.
 *
 * Matching is token-based rather than substring-based so "Xbox" never resolves
 * to the "x" brand, while "github.com" still resolves through "github".
 */
export function resolveBrand(label: string): ResolvedBrand | null {
  const normalized = normalize(label)
  if (!normalized) return null

  const tokens = new Set(normalized.split(' '))
  const padded = ` ${normalized} `

  let best: ResolvedBrand | null = null
  let bestScore = 0

  for (const { brand, alias } of ALIASES) {
    let score = 0
    if (normalized === alias) score = 1000 + alias.length
    else if (alias.includes(' ')) score = padded.includes(` ${alias} `) ? alias.length : 0
    else if (tokens.has(alias)) score = alias.length

    if (score > bestScore) {
      best = brand
      bestScore = score
    }
  }

  return best
}

/** Brand colour at low alpha, for the tile behind the glyph. */
export function brandTint(color: string, alpha = 0.12): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
