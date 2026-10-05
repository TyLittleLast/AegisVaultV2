import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ScoreGauge from './ScoreGauge'

afterEach(cleanup)

/** The value circle is the one carrying an explicit stroke colour. */
function valueDash(container: HTMLElement): { filled: number; track: number } {
  const circles = Array.from(container.querySelectorAll('circle'))
  const value = circles[1]!
  const [filled, track] = value.getAttribute('stroke-dasharray')!.split(/\s+/).map(Number)
  return { filled: filled!, track: track! }
}

describe('ScoreGauge', () => {
  it('shows a placeholder before any audit has run', () => {
    render(<ScoreGauge score={null} />)

    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('non analysé')
    expect(screen.getByText('Non analysé')).toBeTruthy()
  })

  it('scales the dash to the score', () => {
    const { container } = render(<ScoreGauge score={50} />)
    const { filled, track } = valueDash(container)

    // Half the semicircle for half the score, whatever the absolute length is.
    expect(filled / track).toBeCloseTo(0.5, 5)
  })

  it('fills the whole semicircle at 100 and nothing at 0', () => {
    const full = render(<ScoreGauge score={100} />)
    expect(valueDash(full.container).filled / valueDash(full.container).track).toBeCloseTo(1, 5)

    const empty = render(<ScoreGauge score={0} />)
    expect(valueDash(empty.container).filled).toBe(0)
  })

  it('clamps out-of-range scores instead of drawing past the arc', () => {
    const high = render(<ScoreGauge score={140} />)
    expect(valueDash(high.container).filled / valueDash(high.container).track).toBeCloseTo(1, 5)

    const low = render(<ScoreGauge score={-20} />)
    expect(valueDash(low.container).filled).toBe(0)
  })

  it('keeps the track identical whatever the score', () => {
    const a = render(<ScoreGauge score={10} />)
    const b = render(<ScoreGauge score={90} />)
    expect(valueDash(a.container).track).toBe(valueDash(b.container).track)
  })

  it('announces the score for assistive tech', () => {
    render(<ScoreGauge score={73} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('73 sur 100')
  })

  it('grades the label by threshold', () => {
    render(<ScoreGauge score={85} />)
    expect(screen.getByText('Excellent')).toBeTruthy()

    cleanup()
    render(<ScoreGauge score={60} />)
    expect(screen.getByText('Correct')).toBeTruthy()

    cleanup()
    render(<ScoreGauge score={20} />)
    expect(screen.getByText('À consolider')).toBeTruthy()
  })
})
