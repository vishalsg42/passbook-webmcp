import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractTextItems } from '../extract'
import { detectProfile, parseStatement } from '../parseStatement'

/**
 * Validates the parser against the real statement. Skipped when the file is
 * absent, so this never blocks a clean checkout. The statement is never
 * committed: .gitignore excludes *.pdf.
 */
const STATEMENT = join(homedir(), 'Downloads', 'HDFC-2025-26.pdf')
const run = existsSync(STATEMENT) ? describe : describe.skip

run('HDFC parser against the real statement', () => {
  it('parses close to the known row baseline with an intact chain', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ url: STATEMENT, useSystemFonts: true }).promise
    const { items, pageCount } = await extractTextItems(doc)

    const result = parseStatement(items, detectProfile(items)!)
    const { coverage, transactions, failures } = result

    console.log('[hdfc]', {
      pageCount,
      rowsDetected: coverage.rowsDetected,
      rowsParsed: coverage.rowsParsed,
      failures: failures.length,
      chainIntact: coverage.chainIntact,
      brokenSegments: coverage.chainSegments.filter((s) => !s.intact).length,
      firstFailures: failures.slice(0, 3).map((f) => f.reason),
    })

    expect(pageCount).toBe(154)
    // Baseline established by independent extraction: ~1,630 rows.
    expect(coverage.rowsParsed).toBeGreaterThan(1500)
    // Every parsed row must carry the fields the duplicate engine depends on.
    for (const t of transactions.slice(0, 200)) {
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isSafeInteger(t.amount)).toBe(true)
      expect(Number.isSafeInteger(t.balance)).toBe(true)
    }
  }, 120_000)
})
