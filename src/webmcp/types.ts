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

/** Feature-detect the model context. Returns null when WebMCP is unavailable,
 *  so the app can degrade to full manual use behind a capability banner. */
export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null
  const fromDocument = (document as unknown as { modelContext?: ModelContext }).modelContext
  if (fromDocument) return fromDocument
  // Older builds exposed this on navigator. Kept only as a fallback.
  const fromNavigator = (navigator as unknown as { modelContext?: ModelContext }).modelContext
  return fromNavigator ?? null
}

export function isWebMCPAvailable(): boolean {
  return getModelContext() !== null
}
