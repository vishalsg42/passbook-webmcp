import { registry } from '@/webmcp/registry'
import { PROVIDER_IMPLS, type ProviderId, type ToolCall, type Turn } from './providers'

/**
 * The agent loop.
 *
 * Everything here goes through `registry.invoke`, which is the same path an
 * external agent takes: `getTools()` for the live surface, `executeTool` for
 * the call. Nothing reads the tool descriptors directly. That matters because
 * the registered set changes as the work progresses, so a loop holding a list
 * from three turns ago would offer capabilities that no longer exist, and the
 * audit log would miss the calls entirely.
 *
 * The surface is therefore re-read on every turn rather than once at the start.
 */

const SYSTEM = [
  'You are helping the account holder audit their own bank statement inside Passbook.',
  'Use the tools to answer. Never invent an amount, a date, or a bank reference:',
  'if a tool did not return it, say you do not have it.',
  'Amounts are already formatted for display; quote them exactly as given.',
  '',
  'The tools available to you change as the work progresses. If one you expected',
  'is missing, call explain_unavailable_tools rather than guessing.',
  '',
  'Some findings come back with a question attached from the page, because the',
  'statement alone cannot settle them. Put that question to the account holder in',
  'your own words and wait for their answer. Their answer is what decides the case.',
  '',
  'You draft; they commit. Nothing you do enters the final dispute pack without',
  'them accepting it in the page.',
].join('\n')

/** Cap on tool round-trips per user message, so a confused model cannot spend
 *  someone's API credit in a loop. */
const MAX_STEPS = 8

export interface LoopEvent {
  onAssistantText: (text: string) => void
  onToolCall: (call: ToolCall) => void
  onToolResult: (call: ToolCall, output: string, failed: boolean) => void
}

export async function runAgentTurn(args: {
  provider: ProviderId
  apiKey: string
  model: string
  turns: Turn[]
  signal: AbortSignal
  events: LoopEvent
}): Promise<Turn[]> {
  const { provider, apiKey, model, signal, events } = args
  const impl = PROVIDER_IMPLS[provider]
  const turns = [...args.turns]

  for (let step = 0; step < MAX_STEPS; step++) {
    // Re-read every turn: the surface is a function of application state.
    const tools = await registry.getLiveTools()

    const reply = await impl.send({ apiKey, model, system: SYSTEM, turns, tools, signal })
    turns.push({ role: 'assistant', text: reply.text, calls: reply.calls, raw: reply.raw })
    if (reply.text) events.onAssistantText(reply.text)
    if (reply.calls.length === 0) return turns

    const results = []
    for (const call of reply.calls) {
      events.onToolCall(call)
      try {
        const raw = await registry.invoke(call.name, call.input)
        // registry.invoke normalises to the JSON string of a ToolResult.
        const output = (JSON.parse(raw) as { content: { text: string }[] }).content[0].text
        events.onToolResult(call, output, false)
        results.push({ id: call.id, name: call.name, output })
      } catch (err) {
        // A tool that is no longer registered rejects here. Report it to the
        // model as a result rather than throwing: being told the capability is
        // gone is what lets it explain itself instead of retrying blindly.
        const message = err instanceof Error ? err.message : String(err)
        events.onToolResult(call, message, true)
        results.push({ id: call.id, name: call.name, output: `Error: ${message}` })
      }
    }

    turns.push({ role: 'user', results })
  }

  turns.push({
    role: 'assistant',
    text: `Stopped after ${MAX_STEPS} tool calls without reaching an answer.`,
  })
  return turns
}
