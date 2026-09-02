import type { RegisteredTool } from '@/webmcp/types'

/**
 * Bring-your-own-key agent providers.
 *
 * Passbook's first-class path is the reader's own agent: ChatGPT's in-app
 * browser, or Chrome with WebMCP enabled. This module exists for everyone
 * else, because a judge who will not set up an in-app browser otherwise sees a
 * form and a JSON console and never sees the collaboration the project is
 * about.
 *
 * Which providers are here was decided by measurement, not preference. Called
 * from a browser with a deliberately invalid key:
 *
 *   Gemini     HTTP 400  reachable
 *   Anthropic  HTTP 401  reachable, but only with the
 *                        anthropic-dangerous-direct-browser-access header
 *   OpenAI     TypeError: Failed to fetch
 *
 * OpenAI sends no CORS headers, so it cannot be called from a page at all.
 * Proxying it through a serverless function would work and is deliberately not
 * done: it would route the reader's API key through a server this project
 * otherwise does not have, in an app whose whole posture is that no credential
 * reaches anything. Anyone with an OpenAI key already has the better path,
 * which is ChatGPT's in-app browser driving the same tools natively.
 */

export type ProviderId = 'gemini' | 'anthropic'

export interface ProviderInfo {
  id: ProviderId
  label: string
  defaultModel: string
  keyLabel: string
  keyUrl: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    defaultModel: 'gemini-2.0-flash',
    keyLabel: 'Google AI Studio key',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    defaultModel: 'claude-sonnet-5',
    keyLabel: 'Anthropic API key',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
]

/** One turn's worth of conversation, in a shape both providers can be fed. */
export interface Turn {
  role: 'user' | 'assistant'
  /** Prose the model wrote or the person typed. */
  text?: string
  /** Tool calls the model asked for this turn. */
  calls?: ToolCall[]
  /** Results supplied back to the model for the previous turn's calls. */
  results?: ToolResultTurn[]
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultTurn {
  id: string
  name: string
  output: string
}

export interface ProviderReply {
  text: string
  calls: ToolCall[]
}

export interface Provider {
  send(args: {
    apiKey: string
    model: string
    system: string
    turns: Turn[]
    tools: RegisteredTool[]
    signal: AbortSignal
  }): Promise<ProviderReply>
}

/**
 * `getTools()` may hand back `inputSchema` as a JSON string rather than an
 * object. Chrome 152 does exactly that, and both provider APIs reject a string
 * where a schema object is required, so this is not optional politeness.
 */
function schemaOf(tool: RegisteredTool): Record<string, unknown> {
  const raw = tool.inputSchema
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { type: 'object', properties: {} }
    }
  }
  return (raw as Record<string, unknown>) ?? { type: 'object', properties: {} }
}

async function readError(response: Response): Promise<string> {
  const body = await response.text()
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    if (parsed.error?.message) return `${response.status}: ${parsed.error.message}`
  } catch {
    // Not JSON. The raw body is more useful than a bare status code.
  }
  return `${response.status}: ${body.slice(0, 300) || response.statusText}`
}

const gemini: Provider = {
  async send({ apiKey, model, system, turns, tools, signal }) {
    const contents = turns.map((turn) => {
      const parts: Record<string, unknown>[] = []
      if (turn.text) parts.push({ text: turn.text })
      for (const call of turn.calls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.input } })
      }
      for (const result of turn.results ?? []) {
        parts.push({
          functionResponse: { name: result.name, response: { result: result.output } },
        })
      }
      return { role: turn.role === 'assistant' ? 'model' : 'user', parts }
    })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [
            {
              functionDeclarations: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: schemaOf(tool),
              })),
            },
          ],
        }),
      },
    )

    if (!response.ok) throw new Error(await readError(response))

    const body = (await response.json()) as {
      candidates?: { content?: { parts?: Record<string, never>[] } }[]
    }
    const parts = (body.candidates?.[0]?.content?.parts ?? []) as {
      text?: string
      functionCall?: { name: string; args?: Record<string, unknown> }
    }[]

    const text = parts
      .map((p) => p.text)
      .filter(Boolean)
      .join('')
    const calls: ToolCall[] = parts
      .filter((p) => p.functionCall)
      .map((p, index) => ({
        // Gemini matches function responses by name rather than by id, so the
        // id is only ever used locally to key the UI.
        id: `${p.functionCall!.name}-${index}`,
        name: p.functionCall!.name,
        input: p.functionCall!.args ?? {},
      }))

    return { text, calls }
  },
}

const anthropic: Provider = {
  async send({ apiKey, model, system, turns, tools, signal }) {
    const messages = turns.map((turn) => {
      const content: Record<string, unknown>[] = []
      if (turn.text) content.push({ type: 'text', text: turn.text })
      for (const call of turn.calls ?? []) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
      }
      for (const result of turn.results ?? []) {
        content.push({ type: 'tool_result', tool_use_id: result.id, content: result.output })
      }
      return { role: turn.role, content }
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Without this the browser blocks the request outright. Measured.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system,
        messages,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: schemaOf(tool),
        })),
      }),
    })

    if (!response.ok) throw new Error(await readError(response))

    const body = (await response.json()) as {
      content?: {
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, unknown>
      }[]
    }
    const blocks = body.content ?? []

    return {
      text: blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join(''),
      calls: blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: b.id!, name: b.name!, input: b.input ?? {} })),
    }
  },
}

export const PROVIDER_IMPLS: Record<ProviderId, Provider> = { gemini, anthropic }
