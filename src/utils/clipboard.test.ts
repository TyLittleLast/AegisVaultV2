import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLIPBOARD_TTL_MS,
  cancelScheduledClear,
  clearClipboard,
  copySecret,
} from './clipboard'

/** Replaces the read-only `navigator` global with a controllable clipboard stub. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  const clipboard = { writeText: vi.fn(writeText) }
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard },
    configurable: true,
    writable: true,
  })
  return clipboard
}

describe('clipboard', () => {
  beforeEach(() => {
    cancelScheduledClear()
  })

  afterEach(() => {
    cancelScheduledClear()
  })

  it('écrit la valeur fournie', async () => {
    const clipboard = stubClipboard(async () => {})

    await expect(copySecret('s3cret')).resolves.toBe(true)
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith('s3cret')
  })

  it('efface le presse-papiers après le délai', async () => {
    vi.useFakeTimers()
    const clipboard = stubClipboard(async () => {})

    await copySecret('s3cret', 1_000)
    expect(clipboard.writeText).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(clipboard.writeText).toHaveBeenCalledTimes(1) // not yet

    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(clipboard.writeText).toHaveBeenLastCalledWith(' ')
    vi.useRealTimers()
  })

  it('utilise un délai par défaut de 30 s', () => {
    expect(CLIPBOARD_TTL_MS).toBe(30_000)
  })

  it('reprogramme le minuteur au lieu d empiler les effacements', async () => {
    vi.useFakeTimers()
    const clipboard = stubClipboard(async () => {})

    await copySecret('premier', 1_000)
    await copySecret('second', 5_000)

    // The first timer must not still be pending, or the newer secret would be
    // wiped early while the first survives.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(clipboard.writeText).toHaveBeenCalledTimes(2) // 2 writes, no clear yet

    await vi.advanceTimersByTimeAsync(4_000)
    expect(clipboard.writeText).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('renvoie false et ne programme rien si l écriture échoue', async () => {
    vi.useFakeTimers()
    stubClipboard(async () => {
      throw new Error('NotAllowedError')
    })

    await expect(copySecret('s3cret', 1_000)).resolves.toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(vi.getTimerCount()).toBe(0) // nothing scheduled
    vi.useRealTimers()
  })

  it('ne lève pas si le presse-papiers est indisponible', async () => {
    stubClipboard(async () => {
      throw new Error('insecure context')
    })

    await expect(clearClipboard()).resolves.toBeUndefined()
  })

  it("annule proprement un effacement programmé", async () => {
    vi.useFakeTimers()
    const clipboard = stubClipboard(async () => {})

    await copySecret('s3cret', 1_000)
    cancelScheduledClear()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(clipboard.writeText).toHaveBeenCalledTimes(1) // never cleared
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('tolère un appel répété à cancelScheduledClear', () => {
    expect(() => {
      cancelScheduledClear()
      cancelScheduledClear()
    }).not.toThrow()
  })

  it("n'écrit jamais le secret dans le presse-papiers pendant l'effacement", async () => {
    vi.useFakeTimers()
    const writes: string[] = []
    stubClipboard(async (text: string) => {
      writes.push(text)
    })

    await copySecret('correct-horse', 100)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(0)

    expect(writes).toEqual(['correct-horse', ' '])
    expect(writes[1]).not.toContain('horse')
    vi.useRealTimers()
  })
})