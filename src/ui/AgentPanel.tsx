import { useEffect, useState } from 'react'
import { Check, Copy, Play, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { registry } from '@/webmcp/registry'
import { useLiveTools } from './useLiveTools'
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
 * The tool console underneath is a fallback and an inspector for when no agent
 * is driving the page. It calls getTools and executeTool exactly as an agent
 * would, so it exercises the real path rather than a parallel one. That also
 * means it needs WebMCP: without a ModelContext there is no tool map to read
 * and the console lists nothing. Every tool it offers is reachable by clicking
 * elsewhere in the app, so a browser without WebMCP loses the agent, not the
 * product. It is deliberately not dressed up as a chat: the agent here is the
 * reader's, not one this page ships.
 */
export function AgentPanel() {
  const { transactions } = useStore()
  const { tools: liveTools } = useLiveTools()
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
          in your own words. Passbook publishes {liveTools.length}{' '}
          {liveTools.length === 1 ? 'tool' : 'tools'} right now, and that number changes as you
          work: a tool that does not apply yet is not registered at all.
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
  const { tools: liveTools } = useLiveTools()
  const [tool, setTool] = useState('')
  const [args, setArgs] = useState('{}')
  const [output, setOutput] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [running, setRunning] = useState(false)

  // The surface changes as the app changes state, so a name selected earlier
  // can stop being registered. Fall back to the first live tool rather than
  // leaving a selection that would fail with "not registered".
  useEffect(() => {
    if (liveTools.length === 0) return
    if (!liveTools.some((t) => t.name === tool)) setTool(liveTools[0].name)
  }, [liveTools, tool])

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
          {liveTools.map((t) => (
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
