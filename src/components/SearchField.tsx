import { forwardRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  /** Escape closes the field but keeps the query as an active filter. */
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
 * (takes a full-width row) layouts share one implementation, including the
 * clear button and the Escape handling.
 */
const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, onClose, placeholder = 'Rechercher…', inactive = false },
  ref,
) {
  return (
    <label
      aria-hidden={inactive || undefined}
      className="flex h-9 w-full min-w-0 items-center gap-2 rounded-xl bg-white px-3 shadow-card"
    >
      <Search size={15} className="shrink-0 text-inktext-faint" />
      <span className="sr-only">Rechercher dans le coffre</span>
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        placeholder={placeholder}
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
    </label>
  )
})

export default SearchField
