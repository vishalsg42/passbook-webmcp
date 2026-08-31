import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractTextItems } from '../../import/pdf/extract'
import { detectProfile, parseStatement } from '../../import/pdf/parseStatement'
import { findDuplicateCharges, findStandingCommitments } from '../anomalies'
import { formatPaise } from '../money'
import { extractMerchant } from '../merchant'

const STATEMENT = join(homedir(), 'Downloads', 'HDFC-2025-26.pdf')
const run = existsSync(STATEMENT) ? describe : describe.skip

run('anomaly engine on the real statement', () => {
  it('finds duplicate charges with reversals excluded', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ url: STATEMENT, useSystemFonts: true }).promise
    const { items } = await extractTextItems(doc)
    const { transactions } = parseStatement(items, detectProfile(items)!)

    const duplicates = findDuplicateCharges(transactions)
    const commitments = findStandingCommitments(transactions)

    console.log('[anomalies]', {
      transactions: transactions.length,
      duplicates: duplicates.length,
      commitments: commitments.length,
      topDuplicates: duplicates.slice(0, 4).map((f) => ({
        merchant: extractMerchant(f.evidence[0].description).slice(0, 24),
        amount: formatPaise(f.amount ?? 0),
        refsDiffer: f.evidence[0].reference !== f.evidence[1]?.reference,
      })),
      totalAtStake: formatPaise(duplicates.reduce((s, f) => s + (f.amount ?? 0), 0)),
    })

    expect(transactions.length).toBeGreaterThan(1500)
    // Every duplicate must cite two transactions with different references.
    for (const f of duplicates) {
      expect(f.evidence).toHaveLength(2)
      expect(f.amount).toBeGreaterThan(0)
      const [a, b] = f.evidence
      if (a.reference !== '' && b.reference !== '') {
        expect(a.reference).not.toBe(b.reference)
      }
    }
    // Commitments must be genuinely repeated, identical amounts.
    for (const f of commitments) {
      expect(f.evidence.length).toBeGreaterThanOrEqual(3)
      const amounts = new Set(f.evidence.map((t) => t.amount))
      expect(amounts.size).toBe(1)
    }
  }, 120_000)
})
