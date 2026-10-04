import { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'

function getDomain(url?: string) {
  if (!url) return null
  try { return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '') } catch { return null }
}

export default function ServiceLogo({ service: _service, url, size = 40 }: { service: string; url?: string; size?: number }) {
  const domain = getDomain(url)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [domain])
  const boxStyle = { width: size, height: size }

  if (!domain || failed) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-xl bg-white text-inktext-faint shadow-sm"
        style={boxStyle}
      >
        <Globe size={Math.round(size * 0.45)} strokeWidth={1.6} />
      </div>
    )
  }

  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm" style={boxStyle}>
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
        alt=""
        className="object-contain"
        style={{ width: size * 0.55, height: size * 0.55 }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
