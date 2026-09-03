import { store } from '../domain/store'
import { registry } from '../webmcp/registry'
import type { ToolDescriptor, ToolResult } from '../webmcp/types'
import { ALL_TOOLS, TOOL_NAMES } from './index'
import { currentArm, describedOnlyDuplicates } from './ablation'

/**
 * The tool surface follows the state of the app.
 *
 * A tool that exists and returns "you cannot use me yet" is enforcement by
 * instruction: the model is asked not to do something it is still able to do.
 * The ablation posted to WebMCP spec issue #165 measured that arrangement
 * failing 18 out of 18 times under an adversarial prompt, while the same
 * request against an engine-enforced arrangement failed 0 out of 18.
 *
 * So Passbook does not ask. Before a statement is imported the analysis tools
 * are not registered, and an agent that tries to call one gets an UnknownError
 * from the browser rather than a polite refusal from us.
 *
 * Two things make this safe to do repeatedly:
 *
 *  - Every swap runs synchronously through the registry, because awaiting
 *    between an abort and a re-register is what creates the duplicate name
 *    race that rejects with InvalidStateError.
 *  - A single explainer stub stays registered permanently rather than being
 *    swapped in and out. Unregistering into a hole makes agents retry or
 *    invent; unregistering into an explanation makes them tell the user why.
 *    Keeping the stub always present also avoids the flapping the spec warns
 *    about in its unregistration-execution-race example.
 */

/** Always present, whatever the state. Reading these is never wrong. */
const ALWAYS: string[] = [TOOL_NAMES.listAccounts, TOOL_NAMES.explainUnavailable]

/** Present only once a statement has been imported. */
const NEEDS_STATEMENT: string[] = [
  TOOL_NAMES.getDuplicateCandidates,
  TOOL_NAMES.getTransactions,
  TOOL_NAMES.getSpendingSummary,
  TOOL_NAMES.totalSpent,
  TOOL_NAMES.getSpendingSeries,
]

/** Present only while there is something left to draft. */
const NEEDS_UNDRAFTED: string[] = [TOOL_NAMES.draftDisputeCase, TOOL_NAMES.dismissCandidate]

/** Present only once the pack has something in it. */
const NEEDS_PACK: string[] = [TOOL_NAMES.getPackStatus]

export interface SurfaceState {
  hasStatement: boolean
  hasUndraftedCandidates: boolean
  hasPack: boolean
}

export function currentSurfaceState(): SurfaceState {
  const { transactions, findings, pack } = store.get()
  const handled = new Set(pack.cases.map((c) => c.findingId))
  const undrafted = findings.filter(
    (f) => f.kind === 'duplicate_charge' && !handled.has(f.id),
  )

  return {
    hasStatement: transactions.length > 0,
    hasUndraftedCandidates: undrafted.length > 0,
    hasPack: pack.cases.length > 0,
  }
}

/** Which tool names should exist right now. */
export function namesFor(state: SurfaceState): string[] {
  const names = [...ALWAYS]
  if (state.hasStatement) names.push(...NEEDS_STATEMENT)
  if (state.hasStatement && state.hasUndraftedCandidates) names.push(...NEEDS_UNDRAFTED)
  if (state.hasPack) names.push(...NEEDS_PACK)
  return names
}

/**
 * The permanently registered stub. It reports what is missing and why, so an
 * agent that expected a tool to be there learns the reason instead of guessing.
 */
export const explainUnavailable: ToolDescriptor<Record<string, never>> = {
  name: TOOL_NAMES.explainUnavailable,
  description:
    'Explain which Passbook tools are currently unavailable and what the account holder needs to do for them to appear. Call this if a tool you expected is missing.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  execute: (): ToolResult => {
    const state = currentSurfaceState()
    const missing: string[] = []

    if (!state.hasStatement) {
      missing.push(
        'Reading transactions, finding duplicate charges, and summarising spending are unavailable because no statement has been imported. The account holder needs to upload a bank statement PDF or CSV in Passbook.',
      )
    }
    if (state.hasStatement && !state.hasUndraftedCandidates) {
      missing.push(
        'Drafting and dismissing are unavailable because every duplicate candidate has already been drafted or dismissed.',
      )
    }
    if (!state.hasPack) {
      missing.push('Pack status is unavailable because nothing has been drafted yet.')
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            available: namesFor(state),
            unavailable: missing,
            note: 'Unavailable tools are not registered, so calling one fails at the browser rather than being refused by Passbook.',
          }),
        },
      ],
    }
  },
}

/**
 * Register exactly the tools the current state supports.
 *
 * Safe to call on every state change: `sync` diffs against what is already
 * registered and only touches the difference.
 */
export function syncToolSurface(): void {
  const state = currentSurfaceState()
  const wanted = new Set(namesFor(state))
  const descriptors = [explainUnavailable as unknown as ToolDescriptor<never>, ...ALL_TOOLS].filter(
    (t) => wanted.has(t.name),
  )

  // Ablation arm A: the guarded tool stays registered whatever the state, with
  // its guard expressed only in prose. Opt in with ?ablation=instruction.
  if (currentArm() === 'instruction' && !state.hasStatement) {
    descriptors.push(describedOnlyDuplicates as unknown as ToolDescriptor<never>)
  }

  registry.sync(descriptors)
}
