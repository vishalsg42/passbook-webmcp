import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractTextItems } from '../extract'
import { detectProfile, parseStatement } from '../parseStatement'

const FILES = [
  { bank: 'hdfc', file: 'HDFC-2025-26.pdf', minRows: 1500, pages: 154 },
  { bank: 'kotak', file: 'KotakMahindra-2025-26.pdf', minRows: 80, pages: 6 },
  { bank: 'rbl', file: 'RBL-statement-2025-26.pdf', minRows: 120, pages: 7 },
]

const present = FILES.filter((f) => existsSync(join(homedir(), 'Downloads', f.file)))
const run = present.length === FILES.length ? describe : describe.skip

run('all three real statements', () => {
  for (const target of FILES) {
    it(`parses ${target.bank} and detects the layout`, async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const path = join(homedir(), 'Downloads', target.file)
      const doc = await pdfjs.getDocument({ url: path, useSystemFonts: true }).promise
      const { items, pageCount } = await extractTextItems(doc)

      const profile = detectProfile(items)
      expect(profile, `no profile detected for ${target.bank}`).not.toBeNull()
      expect(profile!.id).toBe(target.bank)

      const result = parseStatement(items, profile!)
      console.log(`[${target.bank}]`, {
        pages: pageCount,
        detected: result.coverage.rowsDetected,
        parsed: result.coverage.rowsParsed,
        failures: result.failures.length,
        chainIntact: result.coverage.chainIntact,
        sampleFailure: result.failures[0]?.reason,
      })

      expect(pageCount).toBe(target.pages)
      expect(result.coverage.rowsParsed).toBeGreaterThanOrEqual(target.minRows)
    }, 120_000)
  }
})
