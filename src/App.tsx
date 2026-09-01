import { useEffect } from 'react'
import { BookText, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { store } from '@/domain/store'
import { recomputeFindings } from '@/tools'
import { syncToolSurface } from '@/tools/surface'
import { currentArm, instructionBreaches } from '@/tools/ablation'
import { SEED_LABEL, seedTransactions } from '@/domain/seed'
import { validateChain } from '@/import/pdf/chain'
import { getModelContextError, isWebMCPAvailable } from '@/webmcp/types'
import { AgentPanel } from './ui/AgentPanel'
import { AuditPanel } from './ui/AuditPanel'
import { FindingsPanel } from './ui/FindingsPanel'
import { ImportPanel } from './ui/ImportPanel'
import { PackPanel } from './ui/PackPanel'
import { StatementPanel } from './ui/StatementPanel'
import { ToolSurfacePanel } from './ui/ToolSurfacePanel'
import { useStore } from './ui/useStore'

export function App() {
  const { transactions, statementLabel } = useStore()
  const webmcp = isWebMCPAvailable()
  const webmcpError = getModelContextError()
  const persistError = store.persistError

  useEffect(() => {
    // The registered surface follows app state, so it is re-synced on every
    // change rather than registered once at mount. sync() diffs against what
    // is already registered, so repeated calls are cheap and do not flap.
    syncToolSurface()
    const unsubscribe = store.subscribe(syncToolSurface)

    // Load the demo statement on a first visit so the app is never an empty
    // shell. Anything already imported or restored from storage wins.
    if (store.get().transactions.length === 0) {
      const seeded = seedTransactions()
      const { segments, intact } = validateChain(seeded)
      store.update({
        transactions: seeded,
        findings: recomputeFindings(seeded),
        coverage: {
          rowsDetected: seeded.length,
          rowsParsed: seeded.length,
          failures: 0,
          chainIntact: intact,
          chainSegments: segments,
          pageCount: Math.ceil(seeded.length / 12),
        },
        statementLabel: SEED_LABEL,
      })
      store.log({
        actor: 'human',
        action: 'Loaded the demo statement',
        outcome: 'ok',
        detail: `${seeded.length} sample transactions`,
      })
    }

    return unsubscribe
  }, [])

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-8">
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-navy text-white">
          <BookText className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold tracking-tight">Passbook</h1>
          <p className="m-0 mt-0.5 text-[14px] text-muted">
            It found the money you already lost, and wrote the letter to get it back.
          </p>
        </div>
        {transactions.length > 0 && (
          <div className="ml-auto flex items-center gap-3">
            <span className="num text-[13px] text-muted">
              {statementLabel} · {transactions.length} transactions
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => store.reset()}
            >
              Start over
            </Button>
          </div>
        )}
      </header>

      {currentArm() === 'instruction' && (
        <div className="mb-5 rounded-[10px] border border-[#c3d5f5] bg-[#e8effb] px-4 py-3 text-sm text-[#1e40af]">
          <strong className="block font-semibold">
            Ablation arm A: enforcement by instruction
          </strong>
          get_duplicate_candidates is registered even with no statement imported, and its
          description asks the agent not to call it. Breaches so far:{' '}
          <b className="num">{instructionBreaches()}</b>. Remove{' '}
          <code className="num">?ablation=instruction</code> from the URL for arm B, where the
          capability simply does not exist.
        </div>
      )}

      {!webmcp && (
        <div className="mb-5 flex gap-2.5 rounded-[10px] border border-[#f0dcb8] bg-[#fdf3e3] px-4 py-3 text-sm text-caution">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong className="block font-semibold">
              This browser cannot connect an agent to Passbook
            </strong>
            Everything still works by hand. To let your own agent drive it, open this page in
            ChatGPT&rsquo;s in-app browser, or in Chrome 149+ with{' '}
            <code className="num">chrome://flags/#enable-webmcp-testing</code> enabled.
            {webmcpError && (
              <span className="mt-1.5 block">
                This browser exposes the API but refused to hand it over:{' '}
                <code className="num">{webmcpError}</code>
              </span>
            )}
          </div>
        </div>
      )}

      {persistError && (
        <div className="mb-5 rounded-[10px] border border-[#f5cdc8] bg-[#fdecea] px-4 py-3 text-sm text-danger">
          {persistError}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <ImportPanel />
          <FindingsPanel />
          <PackPanel />
          <StatementPanel />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <AgentPanel />
          <ToolSurfacePanel />
          <AuditPanel />
        </div>
      </div>
    </div>
  )
}
