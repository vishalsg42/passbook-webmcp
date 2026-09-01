import { validateChain } from '../import/pdf/chain'
import { findAll } from './anomalies'
import { SEED_LABEL, seedTransactions } from './seed'
import { store } from './store'

/**
 * Load the seeded demo statement into the store.
 *
 * Shared by the first-visit effect and the "Load the demo statement" button, so
 * there is exactly one definition of what the demo is.
 *
 * Deliberately NOT called from `store.reset()`. Start over dropping the surface
 * from seven tools to two is how revocation is demonstrated: an agent holding a
 * tool reference from before the reset gets an `UnknownError` from the browser
 * rather than a refusal from us. Re-seeding automatically would put the tools
 * straight back and erase the only place that behaviour is visible. The button
 * is the way back, so the empty state is a choice rather than a dead end.
 */
export function loadDemoStatement(): void {
  const transactions = seedTransactions()
  const { segments, intact } = validateChain(transactions)

  store.update({
    transactions,
    findings: findAll(transactions),
    coverage: {
      rowsDetected: transactions.length,
      rowsParsed: transactions.length,
      failures: 0,
      chainIntact: intact,
      chainSegments: segments,
      pageCount: Math.ceil(transactions.length / 12),
    },
    statementLabel: SEED_LABEL,
  })

  store.log({
    actor: 'human',
    action: 'Loaded the demo statement',
    outcome: 'ok',
    detail: `${transactions.length} sample transactions`,
  })
}
