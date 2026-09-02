import { useEffect, useRef, useState } from 'react'
import { KeyRound, Send, Square, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { runAgentTurn } from '@/agent/loop'
import { PROVIDERS, type ProviderId, type Turn } from '@/agent/providers'
import { store } from '@/domain/store'
import { useLiveTools } from './useLiveTools'

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

/**
 * The markdown models actually emit.
 *
 * Not a markdown library: this renders the handful of things that turn up in
 * practice — headings, bullets at a couple of levels, bold, and rules — and
 * leaves everything else as text. Built as React elements rather than parsed
 * HTML, because this is model output rendered in an app that reads bank
 * statements and it is never going near dangerouslySetInnerHTML.
 *
 * Without it a correct answer reads as broken: literal ### before a heading,
 * stray asterisks around every amount, and bullets collapsed onto one line
 * because HTML eats newlines.
 */
function Inline({ text }: { text: string }) {
  // Bold first, then italics inside whatever is left. Doing it the other way
  // round tears `**bold**` in half at its own asterisks.
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
        seg.startsWith('**') && seg.endsWith('**') && seg.length > 4 ? (
          <strong key={i} className="font-semibold">
            {seg.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>
            {seg.split(/(\*[^*\n]+\*)/g).map((bit, j) =>
              bit.startsWith('*') && bit.endsWith('*') && bit.length > 2 ? (
                <em key={j}>{bit.slice(1, -1)}</em>
              ) : (
                <span key={j}>{bit}</span>
              ),
            )}
          </span>
        ),
      )}
    </>
  )
}

function Formatted({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.trim() === '') return null

        if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
          return <hr key={i} className="my-2 border-0 border-t border-line" />
        }

        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          return (
            <p key={i} className="m-0 mt-2 font-semibold text-ink">
              <Inline text={heading[2]} />
            </p>
          )
        }

        const bullet = line.match(/^(\s*)[*\-\u2022]\s+(.*)$/)
        if (bullet) {
          // Indent by nesting depth rather than flattening every level onto
          // the same line, which is what made a breakdown unreadable.
          const depth = Math.min(Math.floor(bullet[1].length / 2), 3)
          return (
            <p
              key={i}
              className="m-0 flex gap-1.5"
              style={{ paddingLeft: `${depth * 14}px` }}
            >
              <span className="text-muted" aria-hidden>
                &bull;
              </span>
              <span className="min-w-0">
                <Inline text={bullet[2]} />
              </span>
            </p>
          )
        }

        return (
          <p key={i} className="m-0">
            <Inline text={line} />
          </p>
        )
      })}
    </div>
  )
}

type Entry =
  | { kind: 'said'; who: 'you' | 'agent'; text: string }
  | { kind: 'tool'; name: string; failed: boolean; output: string }

const KEY_STORAGE = 'passbook.agentkey.session'

export function BuiltInAgentPanel() {
  const { tools } = useLiveTools()
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
  const thread = useRef<HTMLDivElement>(null)

  // Keep the newest turn in view. A reply that arrives below the fold of a
  // scrolling panel reads as nothing having happened.
  useEffect(() => {
    const el = thread.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries])

  // A starting-point chip above loads its prompt here. Left as a window event
  // rather than lifted state: the two panels are siblings with nothing else to
  // say to each other, and threading a callback through the card for one string
  // would be more wiring than the feature is worth.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      setPrompt((e as CustomEvent<string>).detail)
      document.getElementById('agent-prompt')?.focus()
    }
    window.addEventListener('passbook:prompt', onPrompt)
    return () => window.removeEventListener('passbook:prompt', onPrompt)
  }, [])

  const pick = (id: ProviderId) => {
    const next = PROVIDERS.find((p) => p.id === id)!
    setProvider(id)
    setModel(next.defaultModel)
    // Turns carry the previous provider's own representation of its replies,
    // so they cannot be handed to a different one. Clearing is the honest
    // behaviour; replaying them would fail on the first request.
    setTurns([])
    setEntries([])
    setError(null)
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

      {/* Says out loud which half is which. A chat box with an API key in it
          reads as "just an LLM app" unless the split is stated: the key buys
          the model, the page supplies the tools, and the number is live so the
          claim is checkable rather than asserted. */}
      <p className="mb-0 mt-2 text-[12.5px] text-muted">
        Your key buys the <b className="font-semibold text-ink">model</b>. The{' '}
        <b className="font-semibold text-ink">tools</b> come from this page:{' '}
        {info.label} is offered exactly the{' '}
        <b className="num font-semibold text-ink">{tools.length}</b>{' '}
        {tools.length === 1 ? 'tool' : 'tools'} that{' '}
        <code className="num">document.modelContext</code> has registered right now, and every call
        goes through <code className="num">executeTool</code>. Clear the statement and that number
        drops, so the model is never even told the rest exist.
      </p>

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

      {/* One flat panel ran every turn together: you could not tell where a
          question ended and an answer began, and the tool calls looked like
          part of whichever message they sat under. Each turn is now its own
          shape — asked on the right, answered on the left, tool calls as thin
          rows between the two, which is also the order they happen in. */}
      {entries.length > 0 && (
        <div ref={thread} className="mt-3 max-h-96 space-y-2.5 overflow-y-auto py-1">
          {entries.map((entry, i) =>
            entry.kind === 'said' ? (
              <div
                key={i}
                className={
                  entry.who === 'you'
                    ? 'ml-auto w-fit max-w-[85%] rounded-[12px] rounded-br-[4px] bg-navy px-3 py-2 text-[13px] leading-relaxed text-white'
                    : 'mr-auto max-w-full rounded-[12px] rounded-bl-[4px] border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink'
                }
              >
                <span className="sr-only">{entry.who === 'you' ? 'You asked:' : 'Agent replied:'}</span>
                <Formatted text={entry.text} />
              </div>
            ) : (
              <p
                key={i}
                className="m-0 flex flex-wrap items-center gap-1.5 pl-1 text-[12px] text-muted"
              >
                <Wrench className="size-3 shrink-0" aria-hidden />
                <span className="sr-only">Called the page tool</span>
                <code
                  className={`num rounded border px-1.5 py-px ${
                    entry.failed
                      ? 'border-[#f5cdc8] bg-[#fdecea] text-danger'
                      : 'border-line bg-muted-bg'
                  }`}
                >
                  {entry.name}
                </code>
                <span>{entry.failed ? entry.output : `${entry.output.length} chars returned`}</span>
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
