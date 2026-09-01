import { RefreshCw, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLiveTools } from './useLiveTools'

/**
 * What the browser actually has registered, read back through getTools.
 *
 * This reports the real tool map rather than our own bookkeeping. It matters
 * because toolchange fires at Documents rather than at the agent, and the spec
 * says the times at which an agent performs an observation are
 * implementation defined, so the page is the only deterministic place to show
 * what an agent can currently call.
 */
export function ToolSurfacePanel() {
  const { tools, error, failures, refresh } = useLiveTools()

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

      <CardContent className="p-0">
        {error && <p className="px-5 py-4 text-[13px] text-danger">getTools failed: {error}</p>}

        {failures.map((f) => (
          <p key={f.name} className="m-0 border-b border-line px-5 py-3 text-[13px] text-danger">
            <code className="num">{f.name}</code> could not be registered by this browser:{' '}
            {f.reason}
          </p>
        ))}

        {tools.length === 0 && !error && (
          <p className="px-5 py-8 text-center text-[14px] text-muted">
            No tools registered. This browser may not support WebMCP.
          </p>
        )}

        <div className="max-h-80 overflow-y-auto">
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
      </CardContent>
    </Card>
  )
}
