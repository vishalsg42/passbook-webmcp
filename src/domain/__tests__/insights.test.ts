import { describe, expect, it } from 'vitest'
import { concentration, topCounterparties, totalOut } from '../insights'
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
    // Seed has several Swiggy debits with distinct reference tails.
    const swiggy = topCounterparties(tx, 100).filter((c) => c.merchant.includes('SWIGGY'))
    expect(swiggy).toHaveLength(1)
    expect(swiggy[0].count).toBeGreaterThan(1)
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
