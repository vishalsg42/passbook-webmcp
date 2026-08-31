import type { Finding } from './anomalies'
import { formatPaise, type Paise } from './money'
import type { Transaction } from './types'

/**
 * The dispute pack.
 *
 * This is the artifact the human and the agent produce together. The agent
 * drafts a case per finding; the human edits, accepts, or rejects. Nothing
 * enters the committed pack without a human action, and the draft the agent
 * wrote is kept alongside the human's version so the difference between them
 * stays visible.
 */

export type CaseStatus = 'proposed' | 'accepted' | 'rejected'

export interface DisputeCase {
  id: string
  findingId: string
  status: CaseStatus
  /** What the agent wrote. Never overwritten, so the diff survives editing. */
  draft: CaseBody
  /** What the human committed. Null until they accept or edit. */
  committed: CaseBody | null
  /** Present when rejected, for the audit trail. */
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

export interface CaseBody {
  merchant: string
  amount: Paise
  /** Both charge dates, oldest first. */
  dates: string[]
  /** Both bank references, in the same order as `dates`. */
  references: string[]
  /** The letter body a person could send to their bank. */
  narrative: string
}

export interface DisputePack {
  cases: DisputeCase[]
  updatedAt: string
}

export function emptyPack(): DisputePack {
  return { cases: [], updatedAt: new Date().toISOString() }
}

/**
 * Build the default draft for a finding.
 *
 * The agent may replace the narrative, but a deterministic draft means the pack
 * is never empty just because a model phrased something badly, and it gives the
 * human something concrete to edit rather than a blank box.
 */
export function draftFromFinding(finding: Finding): CaseBody {
  const [first, second] = finding.evidence
  const amount = finding.amount ?? Math.abs(second?.amount ?? first?.amount ?? 0)
  const merchant = finding.title.split(' charged twice')[0]

  const dates = finding.evidence.map((t) => t.date)
  const references = finding.evidence.map((t) => t.reference || 'not printed')

  const narrative =
    `I am writing about what appears to be a duplicate charge on my account.\n\n` +
    `${merchant} was debited ${formatPaise(amount)} on ${dates[0]}` +
    (dates[1] && dates[1] !== dates[0] ? ` and again on ${dates[1]}` : ` and again the same day`) +
    `. The two postings carry different bank references (${references.join(' and ')}), ` +
    `so they are separate transactions rather than one transaction shown twice.\n\n` +
    `I have checked my statement for a matching credit and found none, so the second ` +
    `charge does not appear to have been reversed.\n\n` +
    `Please investigate and refund the duplicate amount of ${formatPaise(amount)}.`

  return { merchant, amount, dates, references, narrative }
}

export function addCase(pack: DisputePack, finding: Finding): DisputePack {
  const now = new Date().toISOString()
  const existing = pack.cases.find((c) => c.findingId === finding.id)
  if (existing) return pack

  const next: DisputeCase = {
    id: `case-${finding.id}`,
    findingId: finding.id,
    status: 'proposed',
    draft: draftFromFinding(finding),
    committed: null,
    createdAt: now,
    updatedAt: now,
  }

  return { cases: [...pack.cases, next], updatedAt: now }
}

export function updateCase(
  pack: DisputePack,
  caseId: string,
  change: Partial<Pick<DisputeCase, 'status' | 'committed' | 'rejectionReason'>>,
): DisputePack {
  const now = new Date().toISOString()
  return {
    cases: pack.cases.map((c) =>
      c.id === caseId ? { ...c, ...change, updatedAt: now } : c,
    ),
    updatedAt: now,
  }
}

/** Total value of accepted cases. This is the number the pack is worth. */
export function packValue(pack: DisputePack): Paise {
  return pack.cases
    .filter((c) => c.status === 'accepted')
    .reduce((sum, c) => sum + (c.committed ?? c.draft).amount, 0)
}

/** Render the accepted cases as the document a person actually sends. */
export function renderPack(pack: DisputePack): string {
  const accepted = pack.cases.filter((c) => c.status === 'accepted')
  if (accepted.length === 0) return 'No cases accepted yet.'

  const total = packValue(pack)
  const lines: string[] = [
    'DISPUTE PACK',
    `Prepared ${new Date().toISOString().slice(0, 10)}`,
    `${accepted.length} case${accepted.length === 1 ? '' : 's'}, ${formatPaise(total)} total`,
    '',
    'Drafted by an assistant from the account holder\'s own statement, reviewed and',
    'accepted by the account holder. Each case cites the bank references involved.',
    '',
  ]

  accepted.forEach((c, index) => {
    const body = c.committed ?? c.draft
    lines.push(
      `${'-'.repeat(64)}`,
      `CASE ${index + 1}: ${body.merchant} (${formatPaise(body.amount)})`,
      `Dates: ${body.dates.join(', ')}`,
      `Bank references: ${body.references.join(', ')}`,
      '',
      body.narrative,
      '',
    )
  })

  return lines.join('\n')
}

/** Transactions cited across the whole pack, for the evidence appendix. */
export function citedTransactions(
  pack: DisputePack,
  findings: Finding[],
): Transaction[] {
  const byId = new Map(findings.map((f) => [f.id, f]))
  const out: Transaction[] = []
  for (const c of pack.cases) {
    const finding = byId.get(c.findingId)
    if (finding) out.push(...finding.evidence)
  }
  return out
}
