import { useEffect, useRef } from 'react'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

interface IdleLockOptions {
  /** Only armed while the vault is unlocked. */
  enabled: boolean
  minutes: number
  lockOnBlur: boolean
  onLock: () => void
}

/**
 * Locks the vault after a period of *real* inactivity, and optionally as soon
 * as the window loses focus.
 *
 * A fixed timer set at unlock time is not an inactivity timeout: it fires even
 * while the user is actively typing, and fails to fire promptly when someone
 * else walks up to an already-unlocked machine. Rearming on user interaction
 * is what makes this usable as a safeguard on a shared computer.
 */
export function useIdleLock({ enabled, minutes, lockOnBlur, onLock }: IdleLockOptions): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLockRef = useRef(onLock)

  useEffect(() => {
    onLockRef.current = onLock
  }, [onLock])

  useEffect(() => {
    if (!enabled) return

    const clear = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const rearm = () => {
      clear()
      timerRef.current = setTimeout(() => onLockRef.current(), minutes * 60_000)
    }

    const handleFocusLoss = () => {
      if (lockOnBlur) {
        clear()
        onLockRef.current()
      } else {
        rearm()
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleFocusLoss()
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, rearm, { passive: true })
    }
    window.addEventListener('blur', handleFocusLoss)
    document.addEventListener('visibilitychange', handleVisibility)
    rearm()

    return () => {
      clear()
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, rearm)
      window.removeEventListener('blur', handleFocusLoss)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, minutes, lockOnBlur])
}
