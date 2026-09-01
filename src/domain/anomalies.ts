import { daysBetween } from './dates'
import { merchantKey } from './merchant'
import type { Paise } from './money'
import type { Transaction } from './types'

/**
 * Anomaly detection.
 *
 * Tuned to what the source statements actually contain. Subscription price
 * hikes are deliberately absent: across the three real statements there are 10
 * fixed amount recurring merchants in one and zero in the other two, so a
 * "your subscription went up" finding would have nothing to fire on.
 */

export type FindingKind = 'duplicate_charge' | 'standing_commitment' | 'overdraft_risk'

export type Confidence = 'high' | 'medium'

export interface Finding {
  id: string
  kind: FindingKind
  /** How strongly the evidence supports this being an error rather than
   *  intended behaviour. Stated so the reader can weigh it themselves. */
  confidence: Confidence
  /** One line, written for a person rather than a log. */
  title: string
  /** Rupees at stake, where the finding has an amount. */
  amount: Paise | null
  /** The transactions that caused this finding. Every finding cites evidence
   *  so the agent can be specific instead of vague. */
  evidence: Transaction[]
  /** Why this was not filtered out, stated so a reader can audit the logic. */
  reasoning: string
}

/** Days within which two identical charges are treated as the same event. */
const DUPLICATE_WINDOW_DAYS = 3
/** Days within which a matching credit is treated as a reversal of a debit. */
const REVERSAL_WINDOW_DAYS = 30

/**
 * Narrations that are not merchant charges and so can never be a double charge.
 * ATM withdrawals in particular are routine repeated round amounts from the
 * same card, which naive matching flags in bulk.
 */
const NON_MERCHANT_RAILS = /^(?:ATW|NWD|ATM|EAW|CWD)[-\s]/i

/**
 * A double charge is a one-off accident. A merchant that bills the same amount
 * many times is a standing arrangement, and its identical repeats are the
 * account holder's normal behaviour rather than an error.
 *
 * On the real statement, holding out this rule but keeping the rail filter, the
 * date window and the reversal check flagged 367 pairs, of which 222 were a
 * single investment platform and 110 another: those are recurring instalments,
 * not duplicates.
 *
 * Holding out the rail filter and the window as well gives 545 pairs across 85
 * counterparties, the same two contributing 224 and 110 (re-measured
 * 2026-09-02). Both numbers are real; they answer different questions, so quote
 * the filters held out whenever either is cited.
 *
 * Requiring the amount to be unusual FOR THAT COUNTERPARTY is what separates
 * the accident from the habit.
 */
const MAX_OCCURRENCES_FOR_DUPLICATE = 2

/**
 * Markers that a counterparty is a business rather than a person.
 *
 * Paying a person the same amount twice in two days is often deliberate, while
 * a shop charging the same amount twice in one day usually is not. This is a
 * heuristic and is labelled as one: it sets confidence, it never filters.
 */
const BUSINESS_MARKERS =
  /\b(LTD|LIMITED|PVT|PRIVATE|LLP|INC|CORP|SERVICES|SOLUTIONS|TECHNOLOGIES|HOSPITAL|CLINIC|HOTEL|RESTAURANT|STORE|MART|RETAIL|FOODS|RAILWAYS|ENERGY|TELECOM|BANK|INSURANCE|CAPITAL|FINANCE|MONEY|PAY|BOX)\b/i

/**
 * Duplicate charges.
 *
 * Keyed on the bank reference column, not on (date, amount, merchant).
 * Two charges with the SAME reference are one transaction seen twice, which is
 * an import problem. Two charges with DIFFERENT references, same counterparty,
 * same amount, within a few days, are a genuine double charge.
 *
 * Reversal pairs are excluded. Banks post a debit and then a matching credit
 * when something is refunded, and reporting an already refunded charge in a
 * list headed "money you lost" is the worst available mistake.
 */
export function findDuplicateCharges(transactions: Transaction[]): Finding[] {
  const debits = transactions.filter((t) => t.amount < 0)
  const credits = transactions.filter((t) => t.amount > 0)

  const groups = new Map<string, Transaction[]>()
  for (const debit of debits) {
    // Cash withdrawals and similar rails are not merchant charges.
    if (NON_MERCHANT_RAILS.test(debit.description.trim())) continue
    const key = `${merchantKey(debit.description)}|${debit.amount}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(debit)
    else groups.set(key, [debit])
  }

  const findings: Finding[] = []

  for (const [key, bucket] of groups) {
    if (bucket.length < 2) continue
    // More than a clean pair means this counterparty bills this amount
    // routinely, so the repeat is a standing arrangement rather than an error.
    if (bucket.length > MAX_OCCURRENCES_FOR_DUPLICATE) continue

    const sorted = [...bucket].sort((a, b) => a.date.localeCompare(b.date))

    for (let i = 1; i < sorted.length; i++) {
      const first = sorted[i - 1]
      const second = sorted[i]

      const gap = daysBetween(first.date, second.date)
      if (gap > DUPLICATE_WINDOW_DAYS) continue

      // Same reference means the same posting, not a second charge.
      if (first.reference !== '' && first.reference === second.reference) continue

      const reversal = findReversal(second, credits)
      if (reversal) continue

      const merchant = key.split('|')[0]
      const looksLikeBusiness = BUSINESS_MARKERS.test(merchant)
      const sameDay = gap === 0
      const confidence: Confidence = sameDay && looksLikeBusiness ? 'high' : 'medium'

      findings.push({
        id: `dup-${first.id}-${second.id}`,
        kind: 'duplicate_charge',
        confidence,
        title: `${merchant || 'This merchant'} charged twice within ${gap === 0 ? 'the same day' : `${gap} day${gap === 1 ? '' : 's'}`}`,
        amount: Math.abs(second.amount),
        evidence: [first, second],
        reasoning:
          `Same counterparty and same amount, ${gap} day(s) apart, with different bank references ` +
          `(${first.reference || 'blank'} and ${second.reference || 'blank'}), and no matching credit ` +
          `within ${REVERSAL_WINDOW_DAYS} days that would indicate a reversal. ` +
          `This counterparty was charged this amount only twice in the whole statement, so it is not ` +
          `a recurring arrangement. ` +
          (confidence === 'high'
            ? 'Same day, and the counterparty looks like a business, so a double charge is likely.'
            : 'Confidence is medium: either the charges are on different days, or the counterparty looks like a person, where two identical payments can be deliberate.'),
      })
    }
  }

  return findings.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}

/** A credit that reverses this debit: same magnitude, same counterparty, after
 *  it, and within the reversal window. */
function findReversal(debit: Transaction, credits: Transaction[]): Transaction | null {
  const key = merchantKey(debit.description)
  const magnitude = Math.abs(debit.amount)

  for (const credit of credits) {
    if (credit.amount !== magnitude) continue
    const gap = daysBetween(debit.date, credit.date)
    if (gap < 0 || gap > REVERSAL_WINDOW_DAYS) continue
    if (merchantKey(credit.description) !== key) continue
    return credit
  }

  return null
}

/**
 * Standing commitments: a counterparty debited the same amount on three or more
 * occasions. These are the payments that leave before you look at the account.
 */
export function findStandingCommitments(transactions: Transaction[]): Finding[] {
  const groups = new Map<string, Transaction[]>()

  for (const t of transactions) {
    if (t.amount >= 0) continue
    const key = `${merchantKey(t.description)}|${t.amount}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(t)
    else groups.set(key, [t])
  }

  const findings: Finding[] = []

  for (const [key, bucket] of groups) {
    if (bucket.length < 3) continue
    const merchant = key.split('|')[0]
    if (merchant === '') continue

    const sorted = [...bucket].sort((a, b) => a.date.localeCompare(b.date))
    const monthly = Math.abs(sorted[0].amount)

    findings.push({
      id: `commit-${sorted[0].id}`,
      kind: 'standing_commitment',
      confidence: sorted.length >= 6 ? 'high' : 'medium',
      title: `${merchant} takes the same amount every time, ${sorted.length} times so far`,
      amount: monthly,
      evidence: sorted,
      reasoning:
        `${sorted.length} debits of an identical amount to the same counterparty between ` +
        `${sorted[0].date} and ${sorted[sorted.length - 1].date}.`,
    })
  }

  return findings.sort((a, b) => b.evidence.length - a.evidence.length)
}

/**
 * Overdraft risk: the balance trend plus known standing commitments suggests
 * the account runs dry. Uses the last observed balance, so it is only as
 * current as the statement.
 */
export function findOverdraftRisk(transactions: Transaction[]): Finding[] {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const commitments = findStandingCommitments(transactions)

  const upcoming = commitments.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  if (upcoming === 0 || latest.balance > upcoming) return []

  return [
    {
      id: `overdraft-${latest.id}`,
      kind: 'overdraft_risk',
      confidence: 'medium',
      title: 'Standing commitments exceed the closing balance',
      amount: upcoming - latest.balance,
      evidence: [latest, ...commitments.flatMap((f) => f.evidence.slice(-1))],
      reasoning:
        `Closing balance on ${latest.date} is below the total of one round of ` +
        `${commitments.length} identified standing commitments.`,
    },
  ]
}

export function findAll(transactions: Transaction[]): Finding[] {
  return [
    ...findDuplicateCharges(transactions),
    ...findStandingCommitments(transactions),
    ...findOverdraftRisk(transactions),
  ]
}
