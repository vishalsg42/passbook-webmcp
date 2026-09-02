/**
 * Minimal WebMCP type surface.
 *
 * Declared locally rather than depending on `webmcp-types` so the shape stays
 * pinned to what we verified in the spec source (index.bs, 2026-08):
 *
 *  - the extension is `partial interface Document` (there is exactly one
 *    occurrence of `navigator` in the whole spec), so `document.modelContext`
 *    is the real surface; `navigator.modelContext` is only kept in the
 *    feature-detect for older builds.
 *  - `ToolAnnotations` has exactly two members, `readOnlyHint` and
 *    `untrustedContentHint`. Both are inert booleans that carry no normative
 *    behaviour, they are signals to the agent.
 *  - tool names are ASCII alphanumeric plus `_`, `-`, `.`, max 128 chars.
 */

export interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

/** What `execute` must return. Plain JSON-serialisable values only: the spec
 *  JSON-serialises the result, and a Map/BigInt/circular value fails silently
 *  with a bare `(null, false)` completion that gives the agent no reason. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
}

export interface ToolExecuteOptions {
  /** Signalled when the caller cancels. After cancellation the caller never
   *  observes the tool's natural resolution, so never treat "my promise
   *  resolved" as "the agent received the answer". */
  signal?: AbortSignal
}

export interface ToolDescriptor<TInput = unknown> {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: ToolAnnotations
  execute: (input: TInput, options?: ToolExecuteOptions) => Promise<ToolResult> | ToolResult
}

export interface RegisterToolOptions {
  signal?: AbortSignal
  exposedTo?: string[]
}

export interface RegisteredTool {
  name: string
  title?: string
  description: string
  inputSchema?: Record<string, unknown>
  annotations?: ToolAnnotations
  origin?: string
}

export interface ModelContext extends EventTarget {
  registerTool(tool: ToolDescriptor<never>, options?: RegisterToolOptions): Promise<void>
  getTools(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>
  /** `inputArguments` is a JSON **string**, not an object. Verified on Chrome
   *  151, where passing an object rejects with
   *  `UnknownError: Failed to parse input arguments`. Resolves to a JSON string. */
  executeTool(
    tool: RegisteredTool,
    inputArguments: string,
    options?: { signal?: AbortSignal },
  ): Promise<string>
}

export const MAX_TOOL_NAME_LENGTH = 128
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/

export function isValidToolName(name: string): boolean {
  return name.length > 0 && name.length <= MAX_TOOL_NAME_LENGTH && TOOL_NAME_PATTERN.test(name)
}

/** Why the model context could not be read, when it could not be read. Set on
 *  the first failing access so the capability banner can state a reason rather
 *  than implying the browser simply lacks the feature. */
let modelContextError: string | null = null

export function getModelContextError(): string | null {
  return modelContextError
}

/**
 * Registration needs exactly one operation, and this used to demand three.
 *
 * OpenAI's own integration guide gates on
 * `typeof document.modelContext?.registerTool === 'function'` and nothing else:
 * `getTools` and `executeTool` are how a *page* inspects and invokes a tool
 * map, and an agent-hosting browser has no obligation to expose either. It
 * discovers what the page registered through its own internals.
 *
 * Requiring all three conflated "this page cannot read its own tool map" with
 * "this browser cannot host tools", and the consequence was silent: an in-app
 * browser exposing only `registerTool` would have had every registration
 * refused before it was attempted, and Passbook would have looked, to the one
 * agent it is built for, like a page with no tools at all.
 */
const REGISTRATION_OPERATION = 'registerTool' as const

/** Needed only for the page's own tool console and surface panel. */
const INSPECTION_OPERATIONS = ['getTools', 'executeTool'] as const

/**
 * Detect a model context that is actually usable.
 *
 * Two failure modes, both observed rather than imagined, and neither of which
 * a presence check catches:
 *
 *  - Reading the property can THROW. ModelContext is [SecureContext] and its
 *    operations reject when the agent cluster is not origin-keyed, so a
 *    browser can expose the name and refuse the read.
 *  - The object can be INCOMPLETE. An agent's in-app browser exposed a
 *    modelContext that was not an EventTarget, so addEventListener was not a
 *    function on it. An object missing registerTool, getTools, or executeTool
 *    is equally unusable.
 *
 * This is called during render, so an unguarded throw unmounts the tree and
 * produces a blank page in exactly the environment the app most needs to
 * survive: an in-app browser with no console to read the reason from.
 *
 * Degrading is the documented behaviour. A context that cannot be read, or
 * cannot be used, must cost the agent and never the product.
 */
export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null

  let candidate: ModelContext | undefined
  try {
    candidate =
      (document as unknown as { modelContext?: ModelContext }).modelContext ??
      // Older builds exposed this on navigator. Kept only as a fallback.
      (navigator as unknown as { modelContext?: ModelContext }).modelContext
  } catch (err) {
    modelContextError = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return null
  }

  if (!candidate) return null

  const asRecord = candidate as unknown as Record<string, unknown>
  if (typeof asRecord[REGISTRATION_OPERATION] !== 'function') {
    modelContextError = `document.modelContext is present but has no ${REGISTRATION_OPERATION}`
    return null
  }

  modelContextError = null
  return candidate
}

/**
 * Whether this page can read back and invoke its own tool map.
 *
 * False is a perfectly good state: the browser may host tools for its agent
 * without handing the page the inspection API. Registration still works, so the
 * product still works — what is lost is the tool console and the live surface
 * panel, both of which say so rather than rendering an empty list that looks
 * like a failure.
 */
export function canInspectToolMap(): boolean {
  const mc = getModelContext()
  if (!mc) return false
  const asRecord = mc as unknown as Record<string, unknown>
  return INSPECTION_OPERATIONS.every((op) => typeof asRecord[op] === 'function')
}

export function isWebMCPAvailable(): boolean {
  return getModelContext() !== null
}

/**
 * Whether the context came from the browser or from the vendored polyfill.
 *
 * `index.html` records `window.__webmcpNative` before loading the polyfill,
 * because afterwards the two are indistinguishable from script. The difference
 * is not cosmetic and must never be smoothed over: a polyfilled context lets
 * this page call its own tools, so the tool surface, the console and the
 * activity log all work. It does **not** make the tools discoverable by an
 * agent outside the page, because there is no browser implementation for that
 * agent to talk to. Claiming otherwise would be the one overclaim this project
 * cannot afford.
 */
export function isWebMCPNative(): boolean {
  if (typeof window === 'undefined') return false
  return (window as unknown as { __webmcpNative?: boolean }).__webmcpNative === true
}

/** A usable context that the browser itself provides, rather than the polyfill. */
export function isWebMCPPolyfilled(): boolean {
  return isWebMCPAvailable() && !isWebMCPNative()
}
