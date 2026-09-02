import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_TOOLS, TOOL_NAMES, recomputeFindings } from '../index'
import { currentSurfaceState, namesFor } from '../surface'
import { seedTransactions } from '../../domain/seed'
import { store } from '../../domain/store'
import type { ToolDescriptor } from '../../webmcp/types'

/**
 * The agent's decision tools must land in the pack.
 *
 * dismiss_candidate used to reject only a case that was already in the pack.
 * A candidate is normally dismissed *instead of* being drafted, so the usual
 * path found nothing to reject, changed no state, and still reported success.
 * The finding stayed on the account holder's list after the agent had settled
 * it, and the reason they gave was thrown away.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tool = (name: string) => ALL_TOOLS.find((t) => t.name === name) as ToolDescriptor<any>

// Every Passbook tool is synchronous; awaiting here would hide that.
function run(name: string, args: unknown) {
  const result = tool(name).execute(args as never)
  if (result instanceof Promise) throw new Error(`${name} returned a promise`)
  return JSON.parse(result.content[0].text)
}

describe('agent decisions reach the pack', () => {
  let duplicateId: string

  beforeEach(() => {
    store.reset()
    const transactions = seedTransactions()
    const findings = recomputeFindings(transactions)
    store.update({ transactions, findings })
    duplicateId = findings.filter((f) => f.kind === 'duplicate_charge')[0].id
  })

  it('records a dismissal that was never drafted, with the reason', () => {
    const out = run(TOOL_NAMES.dismissCandidate, {
      candidateId: duplicateId,
      reason: 'I paid the second month on purpose',
    })
    expect(out.dismissed).toBe(duplicateId)

    const [entry] = store.get().pack.cases
    expect(entry).toBeDefined()
    expect(entry.findingId).toBe(duplicateId)
    expect(entry.status).toBe('rejected')
    expect(entry.rejectionReason).toBe('I paid the second month on purpose')
  })

  it('rejects a case that was already drafted rather than adding a second one', () => {
    run(TOOL_NAMES.draftDisputeCase, { candidateId: duplicateId })
    run(TOOL_NAMES.dismissCandidate, { candidateId: duplicateId, reason: 'Changed my mind' })

    const cases = store.get().pack.cases
    expect(cases).toHaveLength(1)
    expect(cases[0].status).toBe('rejected')
    expect(cases[0].rejectionReason).toBe('Changed my mind')
  })

  it('refuses an unknown candidate instead of reporting success', () => {
    const out = run(TOOL_NAMES.dismissCandidate, { candidateId: 'dup-nope', reason: 'x' })
    expect(out.error).toBe('unknown_candidate')
    expect(store.get().pack.cases).toHaveLength(0)
    expect(store.get().audit[0].outcome).toBe('blocked')
  })

  it('revokes the decision tools once every duplicate is settled', () => {
    const duplicates = store.get().findings.filter((f) => f.kind === 'duplicate_charge')
    expect(namesFor(currentSurfaceState())).toContain(TOOL_NAMES.dismissCandidate)

    for (const f of duplicates) {
      run(TOOL_NAMES.dismissCandidate, { candidateId: f.id, reason: 'both intended' })
    }

    const names = namesFor(currentSurfaceState())
    expect(names).not.toContain(TOOL_NAMES.dismissCandidate)
    expect(names).not.toContain(TOOL_NAMES.draftDisputeCase)
    expect(names).toContain(TOOL_NAMES.getPackStatus)
  })
})
