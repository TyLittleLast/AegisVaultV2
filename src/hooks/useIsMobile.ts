import { useEffect, useState } from 'react'

/** Tailwind's `sm` breakpoint, so the JS breakpoint and the CSS one stay aligned. */
export const MOBILE_BREAKPOINT = 640

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window === 'undefined' ? false : window.innerWidth < breakpoint,
  )

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])

  return isMobile
}