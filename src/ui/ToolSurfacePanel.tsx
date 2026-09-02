import type { ReactNode } from 'react'
import { RefreshCw, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { registry } from '@/webmcp/registry'
import { useLiveTools } from './useLiveTools'

/**
 * What the browser actually has registered, read back through getTools.
 *
 * This reports the real tool map rather than our own bookkeeping. It matters
 * because toolchange fires at Documents rather than at the agent, and the spec
 * says the times at which an agent performs an observation are
 * implementation defined, so the page is the only deterministic place to show
 * what an agent can currently call.
 *
 * `bare` drops the card chrome and the scroll cap, for use inside a drawer that
 * supplies its own heading and its own scrolling. Keeping them produced two
 * titles stacked on each other and a list scrolling inside a panel with room
 * to spare.
 */
export function ToolSurfacePanel({ bare = false }: { bare?: boolean } = {}) {
  const { tools, error, failures, refresh } = useLiveTools()

  const body: ReactNode = (
    <>
      {error && <p className="px-5 py-4 text-[13px] text-danger">getTools failed: {error}</p>}

      {failures.map((f) => (
        <p key={f.name} className="m-0 border-b border-line px-5 py-3 text-[13px] text-danger">
          <code className="num">{f.name}</code> could not be registered by this browser: {f.reason}
        </p>
      ))}

      {tools.length === 0 && !error && (
        <p className="px-5 py-8 text-center text-[14px] text-muted">
          No tools registered. This browser may not support WebMCP.
        </p>
      )}

      <div className={bare ? '' : 'max-h-80 overflow-y-auto'}>
        {tools.map((tool) => (
          <div key={tool.name} className="border-t border-line px-5 py-3 first:border-t-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="num text-[12.5px] font-medium">{tool.name}</code>
              {tool.annotations?.readOnlyHint && <Badge variant="neutral">read only</Badge>}
              {tool.annotations?.untrustedContentHint && (
                <Badge variant="untrusted">returns statement text</Badge>
              )}
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-muted">{tool.description}</p>
          </div>
        ))}
      </div>
    </>
  )

  if (bare) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="flex-1">
            {registry.canInspect ? (
              <>
                Read back through <code className="num">getTools()</code>, so this is the
                browser&rsquo;s tool map rather than our own list. It changes as you work.
              </>
            ) : (
              <>
                This browser accepts registrations but does not expose{' '}
                <code className="num">getTools()</code> to the page, so this is what Passbook
                registered rather than what the browser reports. Its agent can still call them.
              </>
            )}
          </span>
          <Button size="icon" variant="ghost" onClick={refresh} aria-label="Refresh tool list">
            <RefreshCw />
          </Button>
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line bg-surface">{body}</div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <Wrench className="size-4 text-muted" aria-hidden />
        <CardTitle>Tools your agent can call</CardTitle>
        <span className="num text-[13px] text-muted">{tools.length}</span>
        <Button size="icon" variant="ghost" onClick={refresh} aria-label="Refresh tool list">
          <RefreshCw />
        </Button>
      </CardHeader>
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  )
}
