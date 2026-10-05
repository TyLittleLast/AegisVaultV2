import type { ReactNode } from 'react'

/**
 * Inline line-art for the three ways a list can come up empty.
 *
 * Everything is drawn with `currentColor` and inherits the caller's text
 * colour, so there is no second palette to keep in sync and no image request.
 */

function VaultIllustration() {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="34" className="fill-current opacity-[0.05]" />
      {/* Body */}
      <rect
        x="20"
        y="24"
        width="56"
        height="48"
        rx="11"
        className="stroke-current opacity-30"
        strokeWidth="2"
      />
      {/* Door seam */}
      <rect
        x="28"
        y="32"
        width="40"
        height="32"
        rx="7"
        className="stroke-current opacity-20"
        strokeWidth="2"
      />
      {/* Combination dial */}
      <circle cx="48" cy="48" r="10" className="stroke-current opacity-60" strokeWidth="2" />
      <circle cx="48" cy="48" r="3.5" className="fill-current opacity-60" />
      <path
        d="M48 34v3.5M48 58.5V62M34 48h3.5M58.5 48H62"
        className="stroke-current opacity-40"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Feet */}
      <path
        d="M30 72v4M66 72v4"
        className="stroke-current opacity-30"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SearchIllustration() {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="34" className="fill-current opacity-[0.05]" />
      {/* Result rows the search came up short on */}
      <path
        d="M20 30h26M20 40h34M20 50h20"
        className="stroke-current opacity-20"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Magnifier */}
      <circle cx="54" cy="46" r="17" className="stroke-current opacity-60" strokeWidth="2" />
      <path
        d="M66 58l11 11"
        className="stroke-current opacity-60"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Empty interior */}
      <path
        d="M47 46h14"
        className="stroke-current opacity-30"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="2 4"
      />
    </svg>
  )
}

function FilterIllustration() {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="34" className="fill-current opacity-[0.05]" />
      <path
        d="M24 28h48L54 50v20l-12-6V50L24 28Z"
        className="stroke-current opacity-50"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Nothing made it through */}
      <circle cx="48" cy="79" r="2.5" className="fill-current opacity-25" />
      <circle cx="58" cy="83" r="1.75" className="fill-current opacity-15" />
      <circle cx="38" cy="83" r="1.75" className="fill-current opacity-15" />
    </svg>
  )
}

const ILLUSTRATIONS = {
  vault: VaultIllustration,
  search: SearchIllustration,
  filter: FilterIllustration,
} as const

export type EmptyStateVariant = keyof typeof ILLUSTRATIONS

interface EmptyStateProps {
  variant: EmptyStateVariant
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({
  variant,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[variant]
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}
    >
      <div className="mb-4 w-24 text-inktext-faint">
        <Illustration />
      </div>
      <p className="mb-1 text-sm font-medium text-inktext">{title}</p>
      <p className="max-w-xs text-sm text-inktext-faint">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
