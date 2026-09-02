import { useEffect, useState } from 'react'
import { BookText, Info, ScrollText, TriangleAlert, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/drawer'
import { store } from '@/domain/store'
import { loadDemoStatement } from '@/domain/demo'
import { SEED_LABEL } from '@/domain/seed'
import { syncToolSurface } from '@/tools/surface'
import { currentArm, instructionBreaches } from '@/tools/ablation'
import { getModelContextError, isWebMCPAvailable, isWebMCPPolyfilled } from '@/webmcp/types'
import { AgentPanel } from './ui/AgentPanel'
import { AuditPanel } from './ui/AuditPanel'
import { FindingsPanel } from './ui/FindingsPanel'
import { ImportPanel } from './ui/ImportPanel'
import { PackPanel } from './ui/PackPanel'
import { StatementModeSwitch } from './ui/StatementModeSwitch'
import { useLiveTools } from './ui/useLiveTools'
import { useStore } from './ui/useStore'
import { StatementPanel } from './ui/StatementPanel'
import { ToolSurfacePanel } from './ui/ToolSurfacePanel'

export function App() {
  const { statementLabel } = useStore()
  // On the demo, importing is not one of the things you are here to do. The
  // switch in the header owns moving to your own statement, so an upload box
  // in the page's best position is a second answer to a settled question, and
  // it pushes the number someone came to see below the fold.
  const onDemo = statementLabel === SEED_LABEL
  // Secondary surfaces. They explain how Passbook works rather than what it
  // found, and they were taking half the screen of an app about somebody's
  // bank statement.
  const [drawer, setDrawer] = useState<'tools' | 'activity' | null>(null)
  const webmcp = isWebMCPAvailable()
  const polyfilled = isWebMCPPolyfilled()
  const webmcpError = getModelContextError()
  const persistError = store.persistError

  useEffect(() => {
    // The registered surface follows app state, so it is re-synced on every
    // change rather than registered once at mount. sync() diffs against what
    // is already registered, so repeated calls are cheap and do not flap.
    syncToolSurface()
    const unsubscribe = store.subscribe(syncToolSurface)

    // Load the demo statement on a first visit so the app is never an empty
    // shell. Anything already imported or restored from storage wins. After a
    // Start over this does not re-run, by design: see the note in demo.ts.
    if (store.get().transactions.length === 0) loadDemoStatement()

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
        {/* Always rendered. This block used to be behind
            `transactions.length > 0`, so clearing the demo removed the only
            control that could bring it back. */}
        <div className="ml-auto flex flex-col items-end gap-2">
          <StatementModeSwitch />
          <InspectorButtons onOpen={setDrawer} />
        </div>
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

      {/* A polyfilled context is a real, working tool map for this page, and a
          judge on any browser can now watch the surface change as they work.
          It is not the same as browser support and is not presented as such:
          an agent outside the page still has nothing to discover. */}
      {polyfilled && (
        <div className="mb-5 flex gap-2.5 rounded-[10px] border border-[#c3d5f5] bg-[#e8effb] px-4 py-3 text-sm text-[#1e40af]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <strong className="block font-semibold">
              Running on the WebMCP polyfill, so you can try everything here
            </strong>
            This browser has no <code className="num">document.modelContext</code>, so Passbook
            loaded the polyfill from Chrome&rsquo;s own demo collection. Every tool below is real
            and callable from this page. What the polyfill cannot do is make them discoverable to
            an agent <em>outside</em> the page &mdash; for that, open this URL in ChatGPT&rsquo;s
            in-app browser, or Chrome 149+ with{' '}
            <code className="num">chrome://flags/#enable-webmcp-testing</code> enabled.
          </div>
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

      {/* Your statement on the left, your agent on the right. The tool
          registry and the activity log moved into drawers: they are the
          evidence for how this works, not the work itself. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {!onDemo && <ImportPanel />}
          <FindingsPanel />
          <PackPanel />
          <StatementPanel />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <AgentPanel />
        </div>
      </div>

      <Drawer open={drawer === 'tools'} onClose={() => setDrawer(null)} title="Tools your agent can call">
        <ToolSurfacePanel bare />
      </Drawer>
      <Drawer open={drawer === 'activity'} onClose={() => setDrawer(null)} title="Activity">
        <AuditPanel bare />
      </Drawer>
    </div>
  )
}

/**
 * Live counters that open the drawers.
 *
 * The tool count is the point. It sits in the header and changes as the work
 * progresses, so the surface following application state is visible while you
 * are looking at findings, which is more convincing than a list in a sidebar
 * people stop seeing.
 */
function InspectorButtons({ onOpen }: { onOpen: (which: 'tools' | 'activity') => void }) {
  const { tools } = useLiveTools()
  const { audit } = useStore()

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" onClick={() => onOpen('tools')}>
        <Wrench />
        Tools <span className="num font-semibold">{tools.length}</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onOpen('activity')}>
        <ScrollText />
        Activity <span className="num font-semibold">{audit.length}</span>
      </Button>
    </div>
  )
}
