import { useState } from 'react'
import { Check, Copy, Play, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ALL_TOOLS } from '@/tools'
import { registry } from '@/webmcp/registry'
import { useStore } from './useStore'

const PROMPTS = [
  'Go through my statement and tell me where I am losing money.',
  'Which charges look like I was billed twice? Show me the evidence.',
  'Draft dispute letters for every high confidence duplicate.',
  'What is in my dispute pack right now?',
]

/**
 * Two ways to drive Passbook.
 *
 * The primary path is the reader's own agent, in ChatGPT's in-app browser or
 * Chrome with WebMCP enabled, calling the tools this page registers. The
 * prompts below are written to be pasted there.
 *
 * The tool console underneath is a fallback and an inspector. It calls the same
 * tools through getTools and executeTool, which the spec provides for in page
 * agents, so the tools can be exercised even in a browser without WebMCP
 * support. It is deliberately not dressed up as a chat: the agent in this
 * product is the reader's, not one this page ships.
 */
export function AgentPanel() {
  const { transactions } = useStore()
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(prompt)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask your agent</CardTitle>
      </CardHeader>

      <CardContent className="border-b border-line py-4">
        <p className="m-0 text-[13px] text-muted">
          Open this page in ChatGPT&rsquo;s in-app browser, or Chrome with WebMCP enabled, and ask
          in your own words. Passbook publishes {ALL_TOOLS.length} tools your agent can call.
        </p>
      </CardContent>

      <div>
        {PROMPTS.map((prompt) => (
          <div
            key={prompt}
            className="flex items-start gap-3 border-t border-line px-5 py-3 first:border-t-0"
          >
            <p className="m-0 flex-1 text-[14px]">{prompt}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void copy(prompt)}
              aria-label={`Copy prompt: ${prompt}`}
            >
              {copied === prompt ? <Check className="text-signal" /> : <Copy />}
              {copied === prompt ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ))}
      </div>

      <ToolConsole disabled={transactions.length === 0} />
    </Card>
  )
}

function ToolConsole({ disabled }: { disabled: boolean }) {
  const [tool, setTool] = useState(ALL_TOOLS[0]?.name ?? '')
  const [args, setArgs] = useState('{}')
  const [output, setOutput] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    setFailed(false)
    try {
      const parsed = args.trim() === '' ? {} : JSON.parse(args)
      const result = await registry.invoke(tool, parsed)
      setOutput(JSON.stringify(JSON.parse(result), null, 2))
    } catch (err) {
      setFailed(true)
      setOutput(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted">
        <Terminal className="size-4" aria-hidden />
        Tool console
        <span className="font-normal">fallback when no agent is connected</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="tool-select">
          Tool to call
        </label>
        <select
          id="tool-select"
          value={tool}
          onChange={(e) => setTool(e.target.value)}
          className="num h-10 min-w-52 flex-1 cursor-pointer rounded-[10px] border border-line bg-surface px-3 text-[13px]"
        >
          {ALL_TOOLS.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="tool-args">
          Arguments as JSON
        </label>
        <Input
          id="tool-args"
          className="num min-w-40 flex-1 text-[13px]"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          placeholder="{}"
        />
        <Button variant="outline" onClick={() => void run()} disabled={running || disabled}>
          <Play />
          Run
        </Button>
      </div>

      {disabled && (
        <p className="mt-2 text-[12.5px] text-muted">Import a statement to call these tools.</p>
      )}

      {output !== null && (
        <pre
          className={`num mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-[10px] px-3 py-2.5 text-[12px] leading-relaxed ${
            failed ? 'bg-[#fdecea] text-danger' : 'bg-muted-bg text-ink'
          }`}
        >
          {output}
        </pre>
      )}
    </div>
  )
}
