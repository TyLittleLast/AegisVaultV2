import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  /** Escape, and the leading icon, collapse the field without clearing it. */
  onClose: () => void
  placeholder?: string
  /**
   * True while the field is collapsed to zero width. The input stays mounted so
   * the unfold can animate, which would otherwise leave it reachable by Tab and
   * announced by screen readers while invisible.
   */
  inactive?: boolean
}

/**
 * The search input itself, without the expand/collapse chrome.
 *
 * Kept separate from the header so the desktop (expands inline) and mobile
 * (takes a full-width row) layouts share one implementation.
 *
 * The leading icon is the collapse control, which is what lets the header hide
 * its own magnifier while the field is open — one search icon on screen at a
 * time, never two. The root is a div rather than a label because a button
 * nested inside a label also triggers the label's activation, which would
 * re-focus the input as it closes.
 */
const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, onClose, placeholder = 'Rechercher…', inactive = false },
  ref,
) {
  return (
    <div
      aria-hidden={inactive || undefined}
      className="flex h-9 w-full min-w-0 items-center gap-2 rounded-xl bg-white px-3 shadow-card"
    >
      <button
        onClick={onClose}
        aria-label="Fermer la recherche"
        tabIndex={inactive ? -1 : 0}
        className="shrink-0 cursor-pointer text-inktext-faint transition-colors hover:text-inktext"
      >
        <Search size={15} />
      </button>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        placeholder={placeholder}
        aria-label="Rechercher dans le coffre"
        autoComplete="off"
        spellCheck={false}
        tabIndex={inactive ? -1 : 0}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-inktext outline-none placeholder:text-inktext-faint"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          tabIndex={inactive ? -1 : 0}
          className="shrink-0 cursor-pointer text-inktext-faint transition-colors hover:text-inktext"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
})

export default SearchField
