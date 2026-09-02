import { describe, expect, it } from 'vitest'
import { findDuplicateCharges } from '../anomalies'
import { sampleCsv } from '../sampleCsv'
import { seedTransactions } from '../seed'
import { parseCsv, previewCsv } from '../../import/csv'

/**
 * The sample CSV must survive a round trip through the real import path.
 *
 * It is offered to readers as proof that Passbook parses files rather than
 * only reading a constant, so a sample that does not actually re-import would
 * be worse than none at all.
 */
describe('sample CSV round trip', () => {
  const csv = sampleCsv()
  const preview = previewCsv(csv)

  it('maps its columns with no manual correction', () => {
    expect(preview.problem).toBeNull()
    expect(preview.mapping).not.toBeNull()
  })

  it('re-imports to exactly the transactions it was generated from', () => {
    const parsed = parseCsv(csv, preview.mapping!)
    const seed = seedTransactions()

    expect(parsed.failures).toHaveLength(0)
    expect(parsed.transactions).toHaveLength(seed.length)

    parsed.transactions.forEach((t, i) => {
      expect(t.date).toBe(seed[i].date)
      expect(t.description).toBe(seed[i].description)
      expect(t.reference).toBe(seed[i].reference)
      expect(t.amount).toBe(seed[i].amount)
      expect(t.balance).toBe(seed[i].balance)
    })
  })

  it('keeps the balance chain intact through the round trip', () => {
    const parsed = parseCsv(csv, preview.mapping!)
    expect(parsed.coverage.chainIntact).toBe(true)
    expect(parsed.coverage.rowsParsed).toBe(parsed.coverage.rowsDetected)
  })

  it('yields the same duplicate findings as the seed', () => {
    const parsed = parseCsv(csv, preview.mapping!)
    const fromCsv = findDuplicateCharges(parsed.transactions)
    const fromSeed = findDuplicateCharges(seedTransactions())

    expect(fromCsv).toHaveLength(fromSeed.length)
    expect(fromCsv.map((f) => f.amount)).toEqual(fromSeed.map((f) => f.amount))
    expect(fromCsv.map((f) => f.confidence)).toEqual(fromSeed.map((f) => f.confidence))
  })
})
