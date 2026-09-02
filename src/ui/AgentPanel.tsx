import { useEffect, useState } from 'react'
import { Check, Copy, Play, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { registry } from '@/webmcp/registry'
import { BuiltInAgentPanel } from './BuiltInAgentPanel'
import { useLiveTools } from './useLiveTools'
import { useStore } from './useStore'

/**
 * Starting points, short label first.
 *
 * These were four full-width rows with a Copy button each, which pushed the
 * conversation itself off the bottom of the screen. As chips they cost one
 * wrapped line, and clicking one loads it into the box so it works for the
 * built-in agent as well as for copying into an in-app browser.
 */
const PROMPTS: { chip: string; text: string }[] = [
  { chip: 'Where did my money go?', text: 'Where did my money actually go? Show me the biggest counterparties and what share they are.' },
  { chip: 'How much on food?', text: 'How much did I spend on food? Work out which counterparties count and total them up.' },
  { chip: 'What leaves on autopilot?', text: 'What standing commitments do I have, and what do they come to in a year?' },
  { chip: 'Anything worth checking?', text: 'Is anything here worth a second look? Show me the evidence for each.' },
]

/**
 * Two ways to drive Passbook.
 *
 * The primary path is the reader's own agent, in ChatGPT's in-app browser or
 * Chrome with WebMCP enabled, calling the tools this page registers. The
 * prompts below are written to be pasted there.
 *
 * Underneath are two fallbacks for readers who will not set that up: a
 * bring-your-own-key agent, and a tool console.
 *
 * The tool console is an inspector for when no agent
 * is driving the page. It calls getTools and executeTool exactly as an agent
 * would, so it exercises the real path rather than a parallel one. That also
 * means it needs WebMCP: without a ModelContext there is no tool map to read
 * and the console lists nothing. Every tool it offers is reachable by clicking
 * elsewhere in the app, so a browser without WebMCP loses the agent, not the
 * product.
 *
 * The built-in agent was added after watching how this actually gets opened.
 * The panel used to say the agent should be the reader's own and stop there,
 * which is the right principle and the wrong product decision: someone who
 * will not install an in-app browser saw a form and a JSON console, and never
 * saw the collaboration this project is about. It is a fallback, not the
 * headline, and it drives the same registry rather than a parallel path.
 */
export function AgentPanel() {
  const { transactions } = useStore()
  const [copied, setCopied] = useState<string | null>(null)

  // One press serves both readers: it loads the prompt into the built-in
  // agent's box, and copies it for anyone pasting into an in-app browser.
  // Clipboard access can be refused, and that must not stop the fill.
  const use = async (prompt: { chip: string; text: string }) => {
    window.dispatchEvent(new CustomEvent('passbook:prompt', { detail: prompt.text }))
    try {
      await navigator.clipboard.writeText(prompt.text)
      setCopied(prompt.text)
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
          in your own words &mdash; or use your own key below.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt.chip}
              type="button"
              onClick={() => void use(prompt)}
              title={prompt.text}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink transition-colors hover:bg-muted-bg"
            >
              {copied === prompt.text ? (
                <Check className="size-3.5 text-signal" aria-hidden />
              ) : (
                <Copy className="size-3.5 text-muted" aria-hidden />
              )}
              {prompt.chip}
            </button>
          ))}
        </div>
      </CardContent>

      <BuiltInAgentPanel />
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
    if (liveTools.some((t) => t.name === tool)) return
    // Default to something read only. The live list is alphabetical, which
    // would otherwise open the console on dismiss_candidate and invite a
    // mutating first click from someone who is only looking around.
    const safe = liveTools.find((t) => t.annotations?.readOnlyHint) ?? liveTools[0]
    setTool(safe.name)
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
