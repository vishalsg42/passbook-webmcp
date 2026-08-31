import type { Paise } from '../../domain/money'
import type { ChainSegment } from '../../domain/types'

/**
 * Running-balance integrity check.
 *
 * Every statement format prints a closing balance per row, which gives a free
 * per-row checksum: balance[n] === balance[n-1] + amount[n].
 *
 * This is the strongest defence against column misattribution, because it
 * localises a failure to a single row instead of leaving you to find which
 * number is wrong across 154 pages.
 *
 * Note the limit: a difference-based chain proves internal consistency, never
 * correctness. A constant offset passes every check, so callers should also
 * anchor against an independently stated opening or closing balance.
 */
export function validateChain(
  rows: Array<{ amount: Paise; balance: Paise }>,
  tolerance: Paise = 0,
): { segments: ChainSegment[]; intact: boolean } {
  if (rows.length < 2) {
    return { segments: [{ fromIndex: 0, toIndex: rows.length - 1, intact: true }], intact: true }
  }

  const segments: ChainSegment[] = []
  let segmentStart = 0
  let intact = true

  for (let i = 1; i < rows.length; i++) {
    const expected = rows[i - 1].balance + rows[i].amount
    const discrepancy = rows[i].balance - expected

    if (Math.abs(discrepancy) > tolerance) {
      intact = false
      segments.push({ fromIndex: segmentStart, toIndex: i - 1, intact: true })
      segments.push({ fromIndex: i, toIndex: i, intact: false, discrepancy })
      segmentStart = i + 1
    }
  }

  if (segmentStart < rows.length) {
    segments.push({ fromIndex: segmentStart, toIndex: rows.length - 1, intact: true })
  }

  return { segments, intact }
}
