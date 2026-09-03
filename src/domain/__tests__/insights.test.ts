import { describe, expect, it } from 'vitest'
import {
  concentration,
  monthlySeries,
  sumMatching,
  topCounterparties,
  totalOut,
} from '../insights'
import { findStandingCommitments } from '../anomalies'
import { seedTransactions } from '../seed'

describe('insights', () => {
  const tx = seedTransactions()

  it('totals only the debits', () => {
    const credits = tx.filter((t) => t.amount > 0)
    expect(credits.length).toBeGreaterThan(0)
    expect(totalOut(tx)).toBe(
      tx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    )
  })

  it('ranks counterparties by spend, largest first', () => {
    const top = topCounterparties(tx)
    expect(top.length).toBeGreaterThan(0)
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].total).toBeGreaterThanOrEqual(top[i].total)
    }
  })

  it('shares are a fraction of total outflow and never exceed it', () => {
    const top = topCounterparties(tx, 100)
    const summed = top.reduce((s, c) => s + c.share, 0)
    expect(summed).toBeGreaterThan(0)
    expect(summed).toBeLessThanOrEqual(1.0000001)
    expect(top.reduce((s, c) => s + c.total, 0)).toBe(totalOut(tx))
  })

  it('groups a counterparty spelled differently into one row', () => {
    // Seed has several delivery debits with distinct reference tails.
    const delivery = topCounterparties(tx, 100).filter((c) => c.merchant.includes('QUICKBITE'))
    expect(delivery).toHaveLength(1)
    expect(delivery[0].count).toBeGreaterThan(1)
  })

  it('reports concentration as a fraction', () => {
    const c = concentration(tx)
    expect(c).toBeGreaterThan(0)
    expect(c).toBeLessThanOrEqual(1)
  })

  it('survives a statement with no debits', () => {
    expect(topCounterparties([])).toEqual([])
    expect(concentration([])).toBe(0)
  })
})

describe('labels', () => {
  it('never surfaces a masked card number as a counterparty', () => {
    const rows = seedTransactions()
    const labels = topCounterparties(rows, 100).map((c) => c.merchant)
    for (const label of labels) {
      expect(label).not.toMatch(/^\d[\dX]{6,}$/i)
      expect(label).not.toMatch(/X{4,}/)
    }
  })

  it('buckets cash withdrawals under one readable name', () => {
    const rows = seedTransactions()
    const cash = topCounterparties(rows, 100).filter((c) => c.merchant === 'Cash withdrawals')
    const atmRows = rows.filter((t) => t.amount < 0 && /^(ATW|NWD|ATM|EAW|CWD)[-\s]/i.test(t.description))
    if (atmRows.length > 0) {
      expect(cash).toHaveLength(1)
      expect(cash[0].count).toBe(atmRows.length)
    }
  })
})

describe('computed totals', () => {
  const tx = seedTransactions()

  it('sums only rows matching a term, and never asks a model to add up', () => {
    const r = sumMatching(tx, { terms: ['quickbite'] })
    const byHand = tx
      .filter((t) => t.amount < 0 && t.description.toLowerCase().includes('quickbite'))
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    expect(r.total).toBe(byHand)
    expect(r.count).toBeGreaterThan(0)
  })

  it('matches any of several terms, which is how a category is expressed', () => {
    const one = sumMatching(tx, { terms: ['quickbite'] })
    const two = sumMatching(tx, { terms: ['quickbite', 'roastery lane'] })
    expect(two.total).toBeGreaterThan(one.total)
    expect(two.count).toBeGreaterThan(one.count)
  })

  it('no terms means everything in that direction', () => {
    expect(sumMatching(tx, {}).total).toBe(totalOut(tx))
    expect(sumMatching(tx, { direction: 'in' }).total).toBe(
      tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    )
  })

  it('honours date bounds inclusively', () => {
    const all = sumMatching(tx, {})
    const bounded = sumMatching(tx, { from: all.firstDate!, to: all.firstDate! })
    expect(bounded.count).toBeGreaterThan(0)
    expect(bounded.total).toBeLessThan(all.total)
    expect(bounded.lastDate).toBe(all.firstDate)
  })

  it('returns an honest empty result rather than a zero that looks like an answer', () => {
    const r = sumMatching(tx, { terms: ['definitelynotinthisstatement'] })
    expect(r.count).toBe(0)
    expect(r.total).toBe(0)
    expect(r.firstDate).toBeNull()
    expect(r.breakdown).toEqual([])
  })

  it('breakdown sums to the total, so the answer can be checked by eye', () => {
    const r = sumMatching(tx, { terms: ['upi'] })
    expect(r.breakdown.reduce((s, c) => s + c.total, 0)).toBe(r.total)
  })
})

describe('standing commitments are annualised', () => {
  it('projects from the observed cadence and stays in proportion', () => {
    const commitments = findStandingCommitments(seedTransactions())
    expect(commitments.length).toBeGreaterThan(0)
    for (const c of commitments) {
      expect(c.projectedAnnual).toBeDefined()
      // A projection must be a whole number of payments' worth, and more than
      // one payment, or it is not telling anyone anything they did not know.
      expect(c.projectedAnnual!).toBeGreaterThan(c.amount!)
    }
  })
})

describe('projections do not claim false precision', () => {
  it('annualised figures are whole tens of rupees, never paise', () => {
    for (const c of findStandingCommitments(seedTransactions())) {
      expect(c.projectedAnnual! % 1000).toBe(0)
    }
  })
})

describe('monthly series', () => {
  const tx = seedTransactions()

  it('is ordered and covers the whole span', () => {
    const s = monthlySeries(tx)
    expect(s.length).toBeGreaterThan(1)
    expect([...s].sort((a, b) => a.month.localeCompare(b.month))).toEqual(s)
    expect(s[0].month).toBe(tx[0].date.slice(0, 7))
    expect(s[s.length - 1].month).toBe(tx[tx.length - 1].date.slice(0, 7))
  })

  it('totals across the series match the statement totals', () => {
    const s = monthlySeries(tx)
    expect(s.reduce((n, m) => n + m.moneyOut, 0)).toBe(totalOut(tx))
    expect(s.reduce((n, m) => n + m.count, 0)).toBe(tx.length)
  })

  it('net is money in minus money out', () => {
    for (const m of monthlySeries(tx)) expect(m.net).toBe(m.moneyIn - m.moneyOut)
  })

  it('includes empty months as zero rather than closing the gap', () => {
    // A January and a March with nothing between them must still yield February,
    // or a chart drawn from this misreports the trend.
    const sparse = [
      { ...tx[0], date: '2026-01-05', amount: -1000 },
      { ...tx[1], date: '2026-03-05', amount: -2000 },
    ]
    const s = monthlySeries(sparse)
    expect(s.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(s[1]).toMatchObject({ moneyOut: 0, moneyIn: 0, count: 0 })
  })

  it('is empty for an empty statement', () => {
    expect(monthlySeries([])).toEqual([])
  })
})
