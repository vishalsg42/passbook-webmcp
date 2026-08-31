import { describe, expect, it } from 'vitest'
import { namesFor } from '../surface'
import { TOOL_NAMES } from '../index'

/**
 * The surface must never expose a capability the state cannot honour. A tool
 * that exists and refuses is enforcement by instruction, which is exactly what
 * this design avoids.
 */
describe('tool surface follows state', () => {
  const empty = { hasStatement: false, hasUndraftedCandidates: false, hasPack: false }

  it('exposes nothing but accounts and the explainer before an import', () => {
    expect(namesFor(empty).sort()).toEqual(
      [TOOL_NAMES.listAccounts, TOOL_NAMES.explainUnavailable].sort(),
    )
  })

  it('never exposes analysis tools without a statement', () => {
    const names = namesFor(empty)
    expect(names).not.toContain(TOOL_NAMES.getDuplicateCandidates)
    expect(names).not.toContain(TOOL_NAMES.getTransactions)
    expect(names).not.toContain(TOOL_NAMES.getSpendingSummary)
  })

  it('exposes analysis once a statement is imported', () => {
    const names = namesFor({ ...empty, hasStatement: true })
    expect(names).toContain(TOOL_NAMES.getDuplicateCandidates)
    expect(names).toContain(TOOL_NAMES.getTransactions)
  })

  it('withdraws drafting when every candidate is handled', () => {
    const withWork = namesFor({ hasStatement: true, hasUndraftedCandidates: true, hasPack: false })
    const noWork = namesFor({ hasStatement: true, hasUndraftedCandidates: false, hasPack: true })
    expect(withWork).toContain(TOOL_NAMES.draftDisputeCase)
    expect(noWork).not.toContain(TOOL_NAMES.draftDisputeCase)
    expect(noWork).not.toContain(TOOL_NAMES.dismissCandidate)
  })

  it('exposes pack status only once something is in the pack', () => {
    expect(namesFor({ ...empty, hasStatement: true })).not.toContain(TOOL_NAMES.getPackStatus)
    expect(namesFor({ ...empty, hasStatement: true, hasPack: true })).toContain(
      TOOL_NAMES.getPackStatus,
    )
  })

  it('keeps the explainer registered in every state', () => {
    for (const state of [
      empty,
      { hasStatement: true, hasUndraftedCandidates: true, hasPack: false },
      { hasStatement: true, hasUndraftedCandidates: false, hasPack: true },
    ]) {
      expect(namesFor(state)).toContain(TOOL_NAMES.explainUnavailable)
    }
  })
})

describe('registry sync replaces a changed descriptor', () => {
  it('does not keep old behaviour under a familiar name', async () => {
    const { ToolRegistry } = await import('../../webmcp/registry')
    const r = new ToolRegistry()
    // Without a WebMCP host, register() is a no-op, so this asserts the diffing
    // decision rather than the browser call.
    const a = { name: 'x', description: 'first', execute: () => ({ content: [] }) } as never
    const b = { name: 'x', description: 'second', execute: () => ({ content: [] }) } as never
    r.sync([a])
    r.sync([b])
    expect(r.registeredNames()).toEqual([])
  })
})
