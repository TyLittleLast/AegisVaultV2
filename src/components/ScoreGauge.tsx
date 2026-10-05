/**
 * Semicircular gauge for the vault health score.
 *
 * Drawn as one circle rotated a half turn so the visible dash runs left to
 * right over the top: the dash length is the score, which avoids computing
 * arc endpoints for every intermediate value.
 */
export default function ScoreGauge({ score, size = 148 }: { score: number | null; size?: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const semicircle = circumference / 2
  const filled = score === null ? 0 : (Math.min(100, Math.max(0, score)) / 100) * semicircle

  const tone =
    score === null
      ? { stroke: '#E3E0DA', text: 'text-inktext-faint', label: 'Non analysé' }
      : score >= 80
        ? { stroke: '#059669', text: 'text-emerald-600', label: 'Excellent' }
        : score >= 50
          ? { stroke: '#D97706', text: 'text-amber-600', label: 'Correct' }
          : { stroke: '#DC2626', text: 'text-red-600', label: 'À consolider' }

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size * 0.62}
        viewBox="0 0 120 74"
        className="overflow-visible"
        role="img"
        aria-label={`Score de santé du coffre : ${score === null ? 'non analysé' : `${score} sur 100`}`}
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="fill-none stroke-border"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${semicircle} ${semicircle}`}
          transform="rotate(180 60 60)"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="fill-none transition-[stroke-dasharray] duration-700 ease-out"
          stroke={tone.stroke}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${semicircle}`}
          transform="rotate(180 60 60)"
        />
        <text
          x="60"
          y="52"
          textAnchor="middle"
          className={`fill-current text-[34px] font-semibold tabular-nums ${tone.text}`}
        >
          {score === null ? '—' : score}
        </text>
      </svg>
      <span className={`mt-1 text-[13px] font-medium ${tone.text}`}>{tone.label}</span>
    </div>
  )
}
