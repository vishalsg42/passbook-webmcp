import { NON_MERCHANT_RAILS } from './anomalies'
import { merchantKey } from './merchant'
import type { Paise } from './money'
import type { Transaction } from './types'

/**
 * Insights: what a statement says once somebody has read all of it.
 *
 * This exists because of what the duplicate audit showed. Against the owner's
 * real 1,630-row statement every candidate pair turned out to be an intentional
 * payment, so "money we got back" was never an honest headline. What Passbook
 * can honestly claim is that it read every row, and the useful output of
 * reading every row is knowing where the money actually went — which is a thing
 * nobody learns from a 154-page PDF, and which needs no guess about intent.
 *
 * Deliberately arithmetic, not inference. Every number here is a sum over rows
 * the parser reconciled against the printed running balance, so it is either
 * right or the chain check already failed.
 */

/**
 * A cash withdrawal has no counterparty, and asking `merchantKey` for one
 * returns the first token after the rail prefix — which on an ATM row is the
 * masked card number. That surfaced `411111XXXXXX0000` as the largest payee on
 * the demo, and would have put a real card's masked PAN in front of the agent
 * through get_spending_summary. Cash is a category, so it is labelled as one.
 */
function labelFor(description: string): string {
  if (NON_MERCHANT_RAILS.test(description.trim())) return 'Cash withdrawals'
  const key = merchantKey(description)
  // A bare masked PAN is not a name either, wherever it turns up.
  if (key === '' || /^\d[\dX]{6,}$/i.test(key.replace(/\s/g, ''))) return 'Uncategorised'
  return key
}

export interface CounterpartyTotal {
  /** Display name, from the same key duplicate matching uses. */
  merchant: string
  /** Total debited to this counterparty across the statement. */
  total: Paise
  /** How many debits made it up. */
  count: number
  /** Fraction of all money out, 0 to 1. */
  share: number
}

/**
 * Where the money went, largest first.
 *
 * Keyed on `merchantKey` so it groups the way duplicate detection groups: one
 * counterparty spelled three ways in the narration counts once.
 */
export function topCounterparties(transactions: Transaction[], limit = 6): CounterpartyTotal[] {
  const totals = new Map<string, { total: Paise; count: number }>()
  let outflow = 0

  for (const t of transactions) {
    // Credits are excluded here, but sumMatching may hand this a credit-only
    // set, in which case there is nothing to rank and it returns empty rather
    // than pretending money coming in went somewhere.
    if (t.amount >= 0) continue
    const spent = Math.abs(t.amount)
    outflow += spent

    const key = labelFor(t.description)
    const entry = totals.get(key)
    if (entry) {
      entry.total += spent
      entry.count += 1
    } else {
      totals.set(key, { total: spent, count: 1 })
    }
  }

  if (outflow === 0) return []

  return [...totals]
    .map(([merchant, v]) => ({ merchant, total: v.total, count: v.count, share: v.total / outflow }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}

/** Total money out across the statement, in paise. */
export function totalOut(transactions: Transaction[]): Paise {
  return transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
}

/**
 * The share of all spending the largest few counterparties account for.
 *
 * The one number that makes a long statement legible: on most accounts a
 * handful of payees are nearly all of it, and people are routinely wrong about
 * which ones.
 */
export function concentration(transactions: Transaction[], top = 5): number {
  const out = totalOut(transactions)
  if (out === 0) return 0
  const head = topCounterparties(transactions, top).reduce((s, c) => s + c.total, 0)
  return head / out
}

/**
 * A computed total over the rows the caller names.
 *
 * This exists to take arithmetic away from the model. Asked "how much did I
 * spend on food", an agent with only `get_transactions` pulls back several
 * thousand characters of rows and adds them up itself — which happened, and
 * happened to be right, and is exactly the thing this project claims not to do.
 *
 * The division of labour that makes the claim true: the model knows Swiggy is
 * food and supplies the terms; the page knows what the numbers are and does the
 * summing over rows already reconciled against the printed running balance.
 * The matched terms come back with the answer so the person can see what was
 * counted as food and disagree.
 */
export interface TotalQuery {
  /** Case-insensitive substrings; a row matches if it contains any of them. */
  terms?: string[]
  /** Inclusive ISO date bounds. */
  from?: string
  to?: string
  direction?: 'out' | 'in'
}

export interface TotalResult {
  total: Paise
  count: number
  /** Per counterparty, largest first, so the total can be checked by eye. */
  breakdown: CounterpartyTotal[]
  /** Dates of the first and last matching row, or null when nothing matched. */
  firstDate: string | null
  lastDate: string | null
}

export function sumMatching(transactions: Transaction[], query: TotalQuery): TotalResult {
  const direction = query.direction ?? 'out'
  const terms = (query.terms ?? []).map((t) => t.toLowerCase()).filter((t) => t !== '')

  const matched = transactions.filter((t) => {
    if (direction === 'out' ? t.amount >= 0 : t.amount <= 0) return false
    if (query.from && t.date < query.from) return false
    if (query.to && t.date > query.to) return false
    if (terms.length === 0) return true
    const haystack = t.description.toLowerCase()
    return terms.some((term) => haystack.includes(term))
  })

  const sorted = [...matched].sort((a, b) => a.date.localeCompare(b.date))

  return {
    total: matched.reduce((s, t) => s + Math.abs(t.amount), 0),
    count: matched.length,
    breakdown: topCounterparties(matched, 12),
    firstDate: sorted[0]?.date ?? null,
    lastDate: sorted[sorted.length - 1]?.date ?? null,
  }
}
