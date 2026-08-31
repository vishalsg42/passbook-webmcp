import { findAll } from '../domain/anomalies'
import { formatPaise } from '../domain/money'
import { addCase, packValue, renderPack, updateCase } from '../domain/pack'
import { store } from '../domain/store'
import { bankLabel, type Transaction } from '../domain/types'
import type { ToolDescriptor, ToolResult } from '../webmcp/types'

/**
 * The Passbook tool suite.
 *
 * Read tools answer questions about the imported statement. Draft tools write
 * into the dispute pack, always as a proposal the human commits.
 *
 * Every tool result carries coverage metadata, so the agent can never report an
 * aggregate without knowing how much of the statement it is based on. Tool
 * descriptions are kept inside Chrome's published budgets: 500 characters per
 * description, 150 per parameter, 30 per name.
 */

export const TOOL_NAMES = {
  listAccounts: 'list_accounts',
  getDuplicateCandidates: 'get_duplicate_candidates',
  getTransactions: 'get_transactions',
  getSpendingSummary: 'get_spending_summary',
  draftDisputeCase: 'draft_dispute_case',
  dismissCandidate: 'dismiss_candidate',
  getPackStatus: 'get_pack_status',
  explainUnavailable: 'explain_unavailable_tools',
} as const

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
}

function coverageBlock() {
  const { coverage } = store.get()
  if (!coverage) return { imported: false as const }
  return {
    imported: true as const,
    rowsParsed: coverage.rowsParsed,
    rowsDetected: coverage.rowsDetected,
    unparsedRows: coverage.failures,
    balanceChainIntact: coverage.chainIntact,
    pages: coverage.pageCount,
  }
}

function summarise(t: Transaction) {
  return {
    date: t.date,
    description: t.description,
    reference: t.reference,
    amount: formatPaise(t.amount),
    balance: formatPaise(t.balance),
  }
}

const listAccounts: ToolDescriptor<Record<string, never>> = {
  name: 'list_accounts',
  description:
    'List the bank accounts imported into Passbook with their closing balance and statement period. Call this first to see what data is available.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const { transactions, statementLabel } = store.get()
    // list_accounts is always registered, so this is the one place a genuine
    // empty state can still be reached.
    if (transactions.length === 0) {
      return ok({
        accounts: [],
        message:
          'No statement has been imported yet. The analysis tools are not registered until one is.',
      })
    }

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
    const result = {
      accounts: [
        {
          label: statementLabel ?? 'Imported statement',
          bank: bankLabel(sorted[0].bank),
          from: sorted[0].date,
          to: sorted[sorted.length - 1].date,
          transactions: sorted.length,
          closingBalance: formatPaise(sorted[sorted.length - 1].balance),
        },
      ],
      coverage: coverageBlock(),
    }
    store.log({ actor: 'agent', action: 'list_accounts', outcome: 'ok', fields: ['label', 'bank', 'period', 'closingBalance'] })
    return ok(result)
  },
}

const getDuplicateCandidates: ToolDescriptor<{ minAmount?: number }> = {
  name: 'get_duplicate_candidates',
  description:
    'Return charges that appear to have been billed twice, with the evidence for each: both dates, both bank references, and why a reversal was ruled out. Each has a confidence of high or medium.',
  inputSchema: {
    type: 'object',
    properties: {
      minAmount: { type: 'number', description: 'Only return candidates worth at least this many rupees.' },
    },
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: ({ minAmount }) => {
    const { findings } = store.get()

    const floor = (minAmount ?? 0) * 100
    const duplicates = findings
      .filter((f) => f.kind === 'duplicate_charge' && (f.amount ?? 0) >= floor)
      .map((f) => ({
        id: f.id,
        title: f.title,
        amount: formatPaise(f.amount ?? 0),
        confidence: f.confidence,
        reasoning: f.reasoning,
        evidence: f.evidence.map(summarise),
      }))

    store.log({
      actor: 'agent',
      action: 'get_duplicate_candidates',
      outcome: 'ok',
      fields: ['title', 'amount', 'confidence', 'reasoning', 'evidence.description', 'evidence.reference'],
      detail: `${duplicates.length} returned`,
    })

    return ok({
      duplicates,
      totalAtStake: formatPaise(duplicates.reduce((s, d) => s + Number(d.amount.replace(/[^\d.]/g, '')) * 100, 0)),
      note: 'Descriptions come from the bank statement and are not written by Passbook.',
      coverage: coverageBlock(),
    })
  },
}

const getTransactions: ToolDescriptor<{ from?: string; to?: string; search?: string; limit?: number }> = {
  name: 'get_transactions',
  description:
    'Return transactions from the imported statement, optionally filtered by date range or a text match on the description. Amounts are negative for money out.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Earliest date, YYYY-MM-DD.' },
      to: { type: 'string', description: 'Latest date, YYYY-MM-DD.' },
      search: { type: 'string', description: 'Case insensitive text to match in the description.' },
      limit: { type: 'number', description: 'Maximum rows to return. Defaults to 50.' },
    },
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: ({ from, to, search, limit }) => {
    const { transactions } = store.get()

    const needle = search?.toLowerCase()
    const filtered = transactions.filter(
      (t) =>
        (!from || t.date >= from) &&
        (!to || t.date <= to) &&
        (!needle || t.description.toLowerCase().includes(needle)),
    )
    const capped = filtered.slice(0, Math.min(limit ?? 50, 200))

    store.log({
      actor: 'agent',
      action: 'get_transactions',
      outcome: 'ok',
      fields: ['date', 'description', 'reference', 'amount', 'balance'],
      detail: `${capped.length} of ${filtered.length} matched`,
    })

    return ok({
      transactions: capped.map(summarise),
      matched: filtered.length,
      returned: capped.length,
      note: 'Descriptions come from the bank statement and are not written by Passbook.',
      coverage: coverageBlock(),
    })
  },
}

const getSpendingSummary: ToolDescriptor<Record<string, never>> = {
  name: 'get_spending_summary',
  description:
    'Total money in and out across the imported statement, plus the count of standing commitments that debit the same amount repeatedly.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const { transactions, findings } = store.get()

    const out = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    const inflow = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)

    store.log({ actor: 'agent', action: 'get_spending_summary', outcome: 'ok', fields: ['totalIn', 'totalOut'] })

    return ok({
      totalOut: formatPaise(Math.abs(out)),
      totalIn: formatPaise(inflow),
      standingCommitments: findings.filter((f) => f.kind === 'standing_commitment').length,
      coverage: coverageBlock(),
    })
  },
}

const draftDisputeCase: ToolDescriptor<{ candidateId: string; narrative?: string }> = {
  name: 'draft_dispute_case',
  description:
    'Draft a dispute case for one duplicate candidate and add it to the pack as a proposal. The account holder must accept it before it enters the final pack. Optionally supply your own letter text.',
  inputSchema: {
    type: 'object',
    properties: {
      candidateId: { type: 'string', description: 'The id from get_duplicate_candidates.' },
      narrative: { type: 'string', description: 'Optional letter body to use instead of the default.' },
    },
    required: ['candidateId'],
  },
  annotations: { readOnlyHint: false },
  execute: ({ candidateId, narrative }) => {
    const state = store.get()
    const finding = state.findings.find((f) => f.id === candidateId)
    if (!finding) {
      store.log({ actor: 'agent', action: 'draft_dispute_case', outcome: 'blocked', detail: `unknown candidate ${candidateId}` })
      return ok({ error: 'unknown_candidate', message: `No candidate with id ${candidateId}.` })
    }

    const pack = addCase(state.pack, finding, narrative)
    store.update({ pack })
    store.log({ actor: 'agent', action: 'draft_dispute_case', outcome: 'ok', detail: candidateId })

    const added = pack.cases.find((c) => c.findingId === finding.id)!
    return ok({
      caseId: added.id,
      status: added.status,
      message:
        'Drafted and added to the pack as a proposal. The account holder reviews and accepts it in Passbook. Nothing further is needed from you.',
      draft: added.draft,
    })
  },
}

const dismissCandidate: ToolDescriptor<{ candidateId: string; reason: string }> = {
  name: 'dismiss_candidate',
  description:
    'Record that a duplicate candidate is not worth disputing, with your reason. Use when the evidence suggests the two charges were both intended.',
  inputSchema: {
    type: 'object',
    properties: {
      candidateId: { type: 'string', description: 'The id from get_duplicate_candidates.' },
      reason: { type: 'string', description: 'Why this is not a duplicate.' },
    },
    required: ['candidateId', 'reason'],
  },
  annotations: { readOnlyHint: false },
  execute: ({ candidateId, reason }) => {
    const state = store.get()
    const existing = state.pack.cases.find((c) => c.findingId === candidateId)
    const pack = existing
      ? updateCase(state.pack, existing.id, { status: 'rejected', rejectionReason: reason })
      : state.pack
    store.update({ pack })
    store.log({ actor: 'agent', action: 'dismiss_candidate', outcome: 'ok', detail: `${candidateId}: ${reason}` })
    return ok({ dismissed: candidateId, reason, message: 'Recorded. The account holder can still reinstate it.' })
  },
}

const getPackStatus: ToolDescriptor<Record<string, never>> = {
  name: 'get_pack_status',
  description:
    'Show the dispute pack: how many cases are proposed, accepted, or rejected, and the total value of accepted cases. Call only if the account holder asks what is in the pack.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: () => {
    const { pack } = store.get()
    const counts = { proposed: 0, accepted: 0, rejected: 0 }
    for (const c of pack.cases) counts[c.status]++

    store.log({ actor: 'agent', action: 'get_pack_status', outcome: 'ok', fields: ['counts', 'acceptedValue'] })

    return ok({
      ...counts,
      acceptedValue: formatPaise(packValue(pack)),
      preview: renderPack(pack).slice(0, 600),
    })
  },
}

export const ALL_TOOLS = [
  listAccounts,
  getDuplicateCandidates,
  getTransactions,
  getSpendingSummary,
  draftDisputeCase,
  dismissCandidate,
  getPackStatus,
] as unknown as ToolDescriptor<never>[]

/** Register the tools the current state supports. Re-run on every change. */
export function registerPassbookTools(): void {
  // Imported lazily: surface.ts imports ALL_TOOLS from here.
  void import('./surface').then((m) => m.syncToolSurface())
}

/** Recompute findings from the current transactions. */
export function recomputeFindings(transactions: Transaction[]) {
  return findAll(transactions)
}
