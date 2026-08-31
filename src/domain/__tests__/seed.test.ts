import { describe, expect, it } from 'vitest'
import { findDuplicateCharges, findStandingCommitments } from '../anomalies'
import { validateChain } from '../../import/pdf/chain'
import { formatPaise } from '../money'
import { seedTransactions } from '../seed'

describe('seeded demo statement', () => {
  const transactions = seedTransactions()

  it('has an intact running balance chain', () => {
    expect(validateChain(transactions).intact).toBe(true)
  })

  it('finds exactly the two planted double charges', () => {
    const duplicates = findDuplicateCharges(transactions)
    const merchants = duplicates.map((f) => f.evidence[0].description)

    console.log('[seed]', {
      duplicates: duplicates.length,
      total: formatPaise(duplicates.reduce((s, f) => s + (f.amount ?? 0), 0)),
      found: duplicates.map((f) => ({
        m: f.evidence[0].description.slice(0, 34),
        amount: formatPaise(f.amount ?? 0),
        confidence: f.confidence,
      })),
    })

    expect(duplicates).toHaveLength(2)
    expect(merchants.some((m) => m.includes('CITYCARE'))).toBe(true)
    expect(merchants.some((m) => m.includes('NORTHGATE'))).toBe(true)
  })

  it('excludes the reversed charge', () => {
    const duplicates = findDuplicateCharges(transactions)
    expect(duplicates.some((f) => f.evidence[0].description.includes('ZENITH'))).toBe(false)
  })

  it('excludes repeated ATM withdrawals', () => {
    const duplicates = findDuplicateCharges(transactions)
    expect(duplicates.some((f) => f.evidence[0].description.startsWith('ATW-'))).toBe(false)
  })

  it('detects the standing commitments', () => {
    const commitments = findStandingCommitments(transactions)
    const names = commitments.map((f) => f.evidence[0].description)
    expect(names.some((n) => n.includes('WEALTHGROW SIP'))).toBe(true)
    expect(names.some((n) => n.includes('ACME INSURANCE'))).toBe(true)
  })
})
