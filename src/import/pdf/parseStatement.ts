import { isAmountToken, parsePaise, type Paise } from '../../domain/money'
import { parseStatementDate } from '../../domain/dates'
import type { ParseFailure, ParseResult, Transaction } from '../../domain/types'
import { groupIntoLines, lineText, type TextItem } from './extract'
import { assignToBands, bandText, findHeader } from './columns'
import { validateChain } from './chain'
import { columnLabels, PROFILES, type BankProfile } from './profiles'

/**
 * Statement parser, driven by a bank profile.
 *
 * Row completion is positional rather than textual: a row is complete when its
 * date band holds a date and its balance band holds a parseable amount. A
 * textual "this line contains a number" rule splits rows on the long UTR digit
 * strings inside UPI narrations, and a mis split still satisfies the balance
 * chain, so that corruption would be silent.
 */
export function parseStatement(
  items: TextItem[],
  profile: BankProfile,
  accountId = `${profile.id}-main`,
): ParseResult {
  const lines = groupIntoLines(items)
  const labels = columnLabels(profile)
  const header = findHeader(lines, labels, { joinNextLine: profile.headerSpansTwoLines })

  if (!header) {
    return {
      transactions: [],
      failures: [{ page: 1, text: '', reason: `${profile.label} header row not found` }],
      coverage: {
        rowsDetected: 0,
        rowsParsed: 0,
        failures: 1,
        chainIntact: false,
        chainSegments: [],
        pageCount: pageCountOf(items),
      },
      openingBalance: null,
    }
  }

  const c = profile.columns
  const transactions: Transaction[] = []
  const failures: ParseFailure[] = []
  let rowsDetected = 0
  let current: Transaction | null = null

  for (const line of lines) {
    const text = lineText(line)
    if (text === '') continue
    if (profile.skip.some((p) => p.test(text))) continue
    if (isHeaderLine(text, profile)) continue

    const cells = assignToBands(line, header.bands)
    const date = parseStatementDate(bandText(cells, c.date))

    if (date === null) {
      // Continuation line: append to the narration of the row in progress.
      if (current) {
        const extra = bandText(cells, c.description)
        if (extra) current.description = `${current.description} ${extra}`.trim()
      }
      continue
    }

    rowsDetected++
    const balanceRaw = bandText(cells, c.balance)

    if (!isAmountToken(balanceRaw)) {
      failures.push({ page: line[0].page, text, reason: 'no parseable closing balance' })
      current = null
      continue
    }

    try {
      const amount = signedAmount(bandText(cells, c.withdrawal), bandText(cells, c.deposit))
      if (amount === null) {
        failures.push({ page: line[0].page, text, reason: 'no withdrawal or deposit amount' })
        current = null
        continue
      }

      const valueRaw = c.valueDate ? bandText(cells, c.valueDate) : ''
      const transaction: Transaction = {
        id: `${profile.id}-${transactions.length}-${date}`,
        accountId,
        date,
        valueDate: parseStatementDate(valueRaw) ?? date,
        description: bandText(cells, c.description),
        reference: bandText(cells, c.reference),
        amount,
        balance: parsePaise(balanceRaw),
        bank: profile.id,
        page: line[0].page,
      }

      transactions.push(transaction)
      current = transaction
    } catch (err) {
      failures.push({
        page: line[0].page,
        text,
        reason: err instanceof Error ? err.message : String(err),
      })
      current = null
    }
  }

  // Statements are printed newest first by some banks and oldest first by
  // others. The running balance chain only holds in posting order, so
  // normalise before validating rather than reporting a false break.
  const ordered = isDescending(transactions) ? [...transactions].reverse() : transactions
  const { segments, intact } = validateChain(ordered)

  return {
    transactions: ordered,
    failures,
    coverage: {
      rowsDetected,
      rowsParsed: transactions.length,
      failures: failures.length,
      chainIntact: intact,
      chainSegments: segments,
      pageCount: pageCountOf(items),
    },
    openingBalance: ordered.length > 0 ? ordered[0].balance - ordered[0].amount : null,
  }
}

/** True when the statement is printed newest first. */
function isDescending(rows: Transaction[]): boolean {
  if (rows.length < 2) return false
  let ascending = 0
  let descending = 0
  for (let i = 1; i < rows.length; i++) {
    const cmp = rows[i].date.localeCompare(rows[i - 1].date)
    if (cmp > 0) ascending++
    else if (cmp < 0) descending++
  }
  return descending > ascending
}

/**
 * Identify which bank produced a statement by finding whose header matches.
 * Returns null when none does, so the caller can say "unrecognised layout"
 * rather than reporting zero transactions and implying an empty statement.
 */
export function detectProfile(items: TextItem[]): BankProfile | null {
  const lines = groupIntoLines(items)
  for (const profile of PROFILES) {
    const header = findHeader(lines, columnLabels(profile), {
      joinNextLine: profile.headerSpansTwoLines,
    })
    if (header) return profile
  }
  return null
}

/** Withdrawal is negative, deposit positive. Exactly one column is populated on
 *  a real row; both blank means an informational row rather than a posting. */
function signedAmount(withdrawalRaw: string, depositRaw: string): Paise | null {
  const hasWithdrawal = isAmountToken(withdrawalRaw)
  const hasDeposit = isAmountToken(depositRaw)

  if (hasWithdrawal && !hasDeposit) return -Math.abs(parsePaise(withdrawalRaw))
  if (hasDeposit && !hasWithdrawal) return Math.abs(parsePaise(depositRaw))
  if (hasWithdrawal && hasDeposit) {
    // Both populated should not happen. Prefer the larger magnitude and let the
    // balance chain flag the row if this guess is wrong.
    const w = Math.abs(parsePaise(withdrawalRaw))
    const d = Math.abs(parsePaise(depositRaw))
    return d >= w ? d : -w
  }
  return null
}

function isHeaderLine(text: string, profile: BankProfile): boolean {
  const lower = text.toLowerCase()
  return (
    lower.includes(profile.columns.description.toLowerCase()) &&
    lower.includes(profile.columns.withdrawal.toLowerCase().split(' ')[0])
  )
}

function pageCountOf(items: TextItem[]): number {
  let max = 0
  for (const item of items) if (item.page > max) max = item.page
  return max
}
