import { useRef, useState } from 'react'
import { KeyRound, Send, Square, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { runAgentTurn } from '@/agent/loop'
import { PROVIDERS, type ProviderId, type Turn } from '@/agent/providers'
import { store } from '@/domain/store'

/**
 * A bring-your-own-key agent, for readers who will not set up an in-app browser.
 *
 * Passbook's first-class path is still the reader's own agent driving the page
 * natively. This is the fallback, and it is not a different implementation of
 * the product: it reads `getTools()` and calls `executeTool` through the same
 * registry an external agent uses, so every call it makes lands in the activity
 * log and the tool surface shrinks underneath it exactly as it would otherwise.
 *
 * The key lives in component state and `sessionStorage`, never `localStorage`,
 * so it dies with the tab. It is sent to the provider the reader chose and
 * nowhere else; there is no server in this project to send it to.
 */

type Entry =
  | { kind: 'said'; who: 'you' | 'agent'; text: string }
  | { kind: 'tool'; name: string; failed: boolean; output: string }

const KEY_STORAGE = 'passbook.agentkey.session'

export function BuiltInAgentPanel() {
  const [provider, setProvider] = useState<ProviderId>('gemini')
  const info = PROVIDERS.find((p) => p.id === provider)!
  const [apiKey, setApiKey] = useState(() => {
    try {
      return sessionStorage.getItem(`${KEY_STORAGE}.${provider}`) ?? ''
    } catch {
      return ''
    }
  })
  const [model, setModel] = useState(info.defaultModel)
  const [prompt, setPrompt] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const pick = (id: ProviderId) => {
    const next = PROVIDERS.find((p) => p.id === id)!
    setProvider(id)
    setModel(next.defaultModel)
    try {
      setApiKey(sessionStorage.getItem(`${KEY_STORAGE}.${id}`) ?? '')
    } catch {
      setApiKey('')
    }
  }

  const rememberKey = (value: string) => {
    setApiKey(value)
    try {
      if (value) sessionStorage.setItem(`${KEY_STORAGE}.${provider}`, value)
      else sessionStorage.removeItem(`${KEY_STORAGE}.${provider}`)
    } catch {
      // Private mode refuses storage. The key still works for this session.
    }
  }

  const send = async () => {
    const text = prompt.trim()
    if (text === '' || apiKey === '' || busy) return

    setPrompt('')
    setError(null)
    setBusy(true)
    setEntries((prev) => [...prev, { kind: 'said', who: 'you', text }])

    const controller = new AbortController()
    abort.current = controller
    const nextTurns: Turn[] = [...turns, { role: 'user', text }]

    store.log({ actor: 'human', action: 'Asked the built-in agent', outcome: 'ok', detail: text })

    try {
      const finished = await runAgentTurn({
        provider,
        apiKey,
        model,
        turns: nextTurns,
        signal: controller.signal,
        events: {
          onAssistantText: (t) =>
            setEntries((prev) => [...prev, { kind: 'said', who: 'agent', text: t }]),
          onToolCall: () => {},
          onToolResult: (call, output, failed) =>
            setEntries((prev) => [...prev, { kind: 'tool', name: call.name, failed, output }]),
        },
      })
      setTurns(finished)
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const clear = () => {
    setTurns([])
    setEntries([])
    setError(null)
  }

  return (
    <div className="border-t border-line px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] font-medium text-muted">
        <KeyRound className="size-4" aria-hidden />
        Or use your own key
        <span className="font-normal">no in-app browser needed</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="agent-provider">
          Provider
        </label>
        <select
          id="agent-provider"
          value={provider}
          onChange={(e) => pick(e.target.value as ProviderId)}
          className="h-10 cursor-pointer rounded-[10px] border border-line bg-surface px-3 text-[13px]"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="agent-key">
          {info.keyLabel}
        </label>
        {/*
          Anti-autofill, and it is not paranoia: Chrome ignored autocomplete="off"
          here and filled a saved website password into this box, which the
          change handler then wrote to sessionStorage. The app captured a
          credential nobody offered it. "new-password" is the value Chrome
          actually honours, the name avoids looking like a login field, and the
          two data attributes opt out of 1Password and LastPass.

          It stays type=password because this field is on screen while people
          record demos.
        */}
        <Input
          id="agent-key"
          type="password"
          name="passbook-provider-key"
          autoComplete="new-password"
          data-1p-ignore=""
          data-lpignore="true"
          spellCheck={false}
          className="num min-w-44 flex-1 text-[13px]"
          value={apiKey}
          placeholder={info.keyLabel}
          onChange={(e) => rememberKey(e.target.value)}
        />
        <label className="sr-only" htmlFor="agent-model">
          Model
        </label>
        <Input
          id="agent-model"
          className="num min-w-36 text-[13px]"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </div>

      <p className="mb-0 mt-2 text-[12.5px] text-muted">
        Your key is kept for this tab only and goes to {info.label} directly &mdash; Passbook has no
        server to send it to.{' '}
        <a
          href={info.keyUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-navy underline"
        >
          Get a key
        </a>
        . OpenAI is missing on purpose: its API sends no CORS headers, so no web page can call it.
        A ChatGPT key is better spent on the in-app browser above, which drives these same tools
        natively.
      </p>

      {entries.length > 0 && (
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-[10px] border border-line bg-muted-bg p-3">
          {entries.map((entry, i) =>
            entry.kind === 'said' ? (
              <p
                key={i}
                className={`m-0 text-[13px] leading-relaxed ${
                  entry.who === 'you' ? 'font-medium text-ink' : 'text-ink'
                }`}
              >
                <span className="mr-2 text-[11px] uppercase tracking-[0.08em] text-muted">
                  {entry.who}
                </span>
                {entry.text}
              </p>
            ) : (
              <p key={i} className="m-0 flex flex-wrap items-center gap-1.5 text-[12px]">
                <Wrench className="size-3 shrink-0 text-muted" aria-hidden />
                <code
                  className={`num rounded border px-1.5 py-px ${
                    entry.failed
                      ? 'border-[#f5cdc8] bg-[#fdecea] text-danger'
                      : 'border-line bg-surface text-muted'
                  }`}
                >
                  {entry.name}
                </code>
                <span className="text-muted">
                  {entry.failed ? entry.output : `${entry.output.length} chars returned`}
                </span>
              </p>
            ),
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-[10px] bg-[#fdecea] px-3 py-2.5 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="agent-prompt">
          Ask the agent
        </label>
        <Input
          id="agent-prompt"
          className="min-w-48 flex-1 text-[13px]"
          value={prompt}
          placeholder="Which charges look like I was billed twice?"
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
        />
        {busy ? (
          <Button variant="outline" onClick={() => abort.current?.abort()}>
            <Square />
            Stop
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void send()} disabled={apiKey === ''}>
            <Send />
            Ask
          </Button>
        )}
        {entries.length > 0 && !busy && (
          <Button variant="ghost" onClick={clear} aria-label="Clear the conversation">
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  )
}
