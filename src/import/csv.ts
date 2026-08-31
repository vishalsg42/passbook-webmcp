import { parseStatementDate } from '../domain/dates'
import { isAmountToken, parsePaise } from '../domain/money'
import type { BankId, ParseFailure, ParseResult, Transaction } from '../domain/types'
import { validateChain } from './pdf/chain'

/**
 * CSV statement import.
 *
 * Banks export wildly different CSVs, so columns are detected from the header
 * and the caller can correct the mapping before committing. Nothing is guessed
 * silently: an unmapped required column is reported rather than defaulted.
 */

export interface CsvMapping {
  date: number
  description: number
  /** Single signed amount column, when the bank uses one. */
  amount?: number
  /** Separate debit and credit columns, when it does not. */
  withdrawal?: number
  deposit?: number
  balance?: number
  reference?: number
}

export interface CsvPreview {
  headers: string[]
  rows: string[][]
  mapping: CsvMapping | null
  /** Why a mapping could not be guessed, for display. */
  problem: string | null
}

/**
 * Split CSV text into rows, honouring quoted fields.
 *
 * A naive split on commas corrupts any description containing one, which in
 * bank exports is most of them.
 */
export function parseCsvText(text: string): string[][] {
  // Strip a UTF-8 BOM, which Excel exports include and which otherwise becomes
  // part of the first header name.
  const input = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const PATTERNS: Array<{ key: keyof CsvMapping; match: RegExp }> = [
  { key: 'date', match: /^(txn|transaction|value|posting)?\s*date$/i },
  { key: 'description', match: /(narration|description|particulars|remarks|details)/i },
  { key: 'reference', match: /(chq|cheque|ref|utr)/i },
  { key: 'withdrawal', match: /(withdrawal|debit|dr\b|paid out)/i },
  { key: 'deposit', match: /(deposit|credit|cr\b|paid in)/i },
  { key: 'balance', match: /balance/i },
  { key: 'amount', match: /^amount$/i },
]

/** Guess the column mapping from the header row. */
export function detectMapping(headers: string[]): CsvMapping | null {
  const found: Partial<Record<keyof CsvMapping, number>> = {}

  headers.forEach((header, index) => {
    const name = header.trim()
    for (const { key, match } of PATTERNS) {
      if (found[key] === undefined && match.test(name)) {
        found[key] = index
        break
      }
    }
  })

  if (found.date === undefined || found.description === undefined) return null
  const hasAmount = found.amount !== undefined
  const hasPair = found.withdrawal !== undefined || found.deposit !== undefined
  if (!hasAmount && !hasPair) return null

  return {
    date: found.date,
    description: found.description,
    amount: found.amount,
    withdrawal: found.withdrawal,
    deposit: found.deposit,
    balance: found.balance,
    reference: found.reference,
  }
}

export function previewCsv(text: string): CsvPreview {
  const rows = parseCsvText(text)
  if (rows.length < 2) {
    return { headers: [], rows: [], mapping: null, problem: 'This file has no data rows.' }
  }

  const headers = rows[0].map((h) => h.trim())
  const mapping = detectMapping(headers)

  return {
    headers,
    rows: rows.slice(1),
    mapping,
    problem: mapping
      ? null
      : 'Could not work out which columns hold the date, description, and amount. Map them below.',
  }
}

/** Turn mapped CSV rows into transactions. */
export function parseCsv(
  text: string,
  mapping: CsvMapping,
  accountId = 'csv-main',
  /** Set when the user tells us which bank the export came from. A CSV almost
   *  never says, so this defaults to unknown rather than guessing. */
  bank: BankId = 'unknown',
): ParseResult {
  const { rows } = previewCsv(text)
  const transactions: Transaction[] = []
  const failures: ParseFailure[] = []
  let runningBalance = 0

  rows.forEach((row, index) => {
    const raw = row.join(' ').slice(0, 160)
    const date = parseStatementDate((row[mapping.date] ?? '').trim())

    if (!date) {
      failures.push({ page: 1, text: raw, reason: 'unreadable date' })
      return
    }

    try {
      const amount = amountFor(row, mapping)
      if (amount === null) {
        failures.push({ page: 1, text: raw, reason: 'no readable amount' })
        return
      }

      const balanceCell = mapping.balance !== undefined ? (row[mapping.balance] ?? '').trim() : ''
      const balance = isAmountToken(balanceCell)
        ? parsePaise(balanceCell)
        : (runningBalance += amount)
      runningBalance = balance

      transactions.push({
        id: `csv-${index}-${date}`,
        accountId,
        date,
        valueDate: date,
        description: (row[mapping.description] ?? '').trim(),
        reference:
          mapping.reference !== undefined ? (row[mapping.reference] ?? '').trim() : '',
        amount,
        balance,
        bank,
        page: 1,
      })
    } catch (err) {
      failures.push({
        page: 1,
        text: raw,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  })

  const ordered =
    transactions.length > 1 &&
    transactions[0].date.localeCompare(transactions[transactions.length - 1].date) > 0
      ? [...transactions].reverse()
      : transactions

  // Only meaningful when the export carried its own balance column. A balance
  // we derived ourselves would validate trivially and prove nothing.
  const hasRealBalances = mapping.balance !== undefined
  const { segments, intact } = hasRealBalances
    ? validateChain(ordered)
    : { segments: [], intact: false }

  return {
    transactions: ordered,
    failures,
    coverage: {
      rowsDetected: rows.length,
      rowsParsed: ordered.length,
      failures: failures.length,
      chainIntact: intact,
      chainSegments: segments,
      pageCount: 1,
    },
    openingBalance: ordered.length > 0 ? ordered[0].balance - ordered[0].amount : null,
  }
}

function amountFor(row: string[], mapping: CsvMapping): number | null {
  if (mapping.amount !== undefined) {
    const cell = (row[mapping.amount] ?? '').trim()
    return isAmountToken(cell) ? parsePaise(cell) : null
  }

  const withdrawalCell =
    mapping.withdrawal !== undefined ? (row[mapping.withdrawal] ?? '').trim() : ''
  const depositCell = mapping.deposit !== undefined ? (row[mapping.deposit] ?? '').trim() : ''

  const hasWithdrawal = isAmountToken(withdrawalCell)
  const hasDeposit = isAmountToken(depositCell)

  if (hasWithdrawal && !hasDeposit) return -Math.abs(parsePaise(withdrawalCell))
  if (hasDeposit && !hasWithdrawal) return Math.abs(parsePaise(depositCell))
  return null
}
