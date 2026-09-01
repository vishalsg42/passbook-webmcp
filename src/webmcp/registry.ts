/**
 * Tool registry.
 *
 * Owns every call to `document.modelContext.registerTool` so that the
 * spec hazards we verified are handled in exactly one place:
 *
 *  - `registerTool` mutates the tool map SYNCHRONOUSLY and only resolves its
 *    promise via a queued task. So an abort-then-register swap performed in one
 *    synchronous block cannot throw `InvalidStateError`. Awaiting between the
 *    two is what creates the duplicate-name race, so we never do.
 *  - aborting a registration's signal REJECTS that registration's promise with
 *    the abort reason. Every call therefore needs a `.catch`, or narrowing
 *    scope produces unhandled rejections.
 *  - unregistering does NOT cancel an in-flight `execute`. Callers that care
 *    must re-check their own preconditions at commit time.
 *  - `toolchange` fires at Documents, not at the agent, and the agent observes
 *    at implementation-defined times. Never assume the agent noticed.
 */

import {
  getModelContext,
  isValidToolName,
  type RegisteredTool,
  type ToolDescriptor,
} from './types'

interface Entry {
  descriptor: ToolDescriptor<never>
  controller: AbortController
}

export class ToolRegistry {
  private entries = new Map<string, Entry>()
  private listeners = new Set<() => void>()
  /** Tools the browser refused to register, by name, with the reason. */
  private failures = new Map<string, string>()

  get available(): boolean {
    return getModelContext() !== null
  }

  /** Names this registry currently believes are registered. */
  registeredNames(): string[] {
    return [...this.entries.keys()].sort()
  }

  /**
   * Register a tool. Idempotent from the caller's perspective: registering a
   * name that is already present performs a synchronous swap (abort + register
   * with no await in between), which the spec permits without InvalidStateError.
   */
  register(descriptor: ToolDescriptor<never>): boolean {
    if (!isValidToolName(descriptor.name)) {
      throw new Error(
        `Invalid tool name "${descriptor.name}": must be 1-128 chars of [A-Za-z0-9_.-]`,
      )
    }
    const mc = getModelContext()
    if (!mc) return false

    // Synchronous swap. No await between abort and register.
    const existing = this.entries.get(descriptor.name)
    if (existing) existing.controller.abort()

    const controller = new AbortController()
    this.entries.set(descriptor.name, { descriptor, controller })
    this.failures.delete(descriptor.name)

    // Aborting the signal rejects this promise with the abort reason. That is
    // expected during a swap or an unregister, so it is swallowed rather than
    // surfaced. Any other rejection is a real bug and is reported.
    mc.registerTool(descriptor, { signal: controller.signal }).catch((err: unknown) => {
      if (controller.signal.aborted) return
      // Reported, not just logged. A console line is invisible in an agent's
      // in-app browser, which is exactly where a registration is most likely to
      // fail and where the reader has no devtools to find out why. A tool that
      // silently fails to register leaves the surface one short with no
      // explanation.
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      this.failures.set(descriptor.name, message)
      this.entries.delete(descriptor.name)
      console.error(`[passbook] registerTool failed for "${descriptor.name}"`, err)
      this.emit()
    })

    this.emit()
    return true
  }

  /** Unregister a tool. Returns false if it was not registered. */
  unregister(name: string): boolean {
    const entry = this.entries.get(name)
    if (!entry) return false
    entry.controller.abort()
    this.entries.delete(name)
    this.emit()
    return true
  }

  /** Replace the registered set with exactly `descriptors`, in one synchronous
   *  pass. Used when application state changes which tools should exist.
   *
   *  A name that is already registered is re-registered when the descriptor
   *  itself has changed. Skipping that would silently keep the old behaviour
   *  under a familiar name, which is worse than not registering at all: the
   *  agent sees the name it expects and gets something else. */
  sync(descriptors: ToolDescriptor<never>[]): void {
    const wanted = new Map(descriptors.map((d) => [d.name, d]))

    for (const name of [...this.entries.keys()]) {
      if (!wanted.has(name)) this.unregister(name)
    }

    for (const descriptor of descriptors) {
      const existing = this.entries.get(descriptor.name)
      if (existing?.descriptor === descriptor) continue
      // register() performs a synchronous abort-then-register swap, so
      // replacing in place is safe and cannot hit the duplicate name race.
      this.register(descriptor)
    }
  }

  /** Ask the browser what is actually registered. This is the authoritative
   *  view, used by the UI panel so the demo asserts on the real tool map
   *  rather than on this class's bookkeeping. */
  async getLiveTools(): Promise<RegisteredTool[]> {
    const mc = getModelContext()
    if (!mc) return []
    try {
      return await mc.getTools()
    } catch (err) {
      console.error('[passbook] getTools failed', err)
      return []
    }
  }

  /**
   * Invoke a registered tool through the browser, exactly as an agent would.
   * This is both the in-page agent path and the day-one verification path.
   *
   * Implementations disagree about the argument type, so it is negotiated
   * rather than assumed. Both halves are measured, not guessed:
   *
   *   Chrome 151          wants a JSON **string**. An object rejects with
   *                       `UnknownError: Failed to parse input arguments`.
   *   In-app browser      wants an **object**. A string rejects with
   *                       `WebMCP executeTool requires an object input.`
   *
   * The first successful form is remembered, so at most one call ever pays for
   * the probe. Retrying is only safe because both rejections happen while
   * validating the input, before `execute` runs, so nothing was performed on
   * the first attempt. The retry is therefore gated on the error actually
   * looking like an input-shape complaint: retrying a mutating tool on any
   * other error could draft the same dispute twice.
   *
   * The tool must also be the `RegisteredTool` returned by `getTools()`. It
   * carries a required `origin` member, and a hand-built object literal throws
   * a TypeError before execution is attempted.
   */
  private argumentForm: 'string' | 'object' | null = null

  /** Rejections that mean "wrong argument type", not "your call failed". */
  private static readonly SHAPE_COMPLAINT =
    /requires an object|failed to parse input arguments|must be an object|expected an object|not a valid json/i

  async invoke(name: string, input: unknown): Promise<string> {
    const mc = getModelContext()
    if (!mc) throw new Error('WebMCP unavailable')
    const tools = await mc.getTools()
    const tool = tools.find((t) => t.name === name)
    if (!tool) {
      // Matches what an agent holding a stale list sees: the spec rejects with
      // UnknownError when the name is absent from the live map.
      throw new Error(`Tool "${name}" is not registered`)
    }

    const args = (input ?? {}) as object
    const forms: ('string' | 'object')[] = this.argumentForm
      ? [this.argumentForm]
      : ['string', 'object']

    let lastError: unknown
    for (const form of forms) {
      try {
        const result = await mc.executeTool(
          tool,
          (form === 'string' ? JSON.stringify(args) : args) as string,
        )
        this.argumentForm = form
        // Chrome resolves to a JSON string. An implementation that resolves to
        // an object is normalised here so callers have one shape to parse.
        return typeof result === 'string' ? result : JSON.stringify(result)
      } catch (err) {
        lastError = err
        const message = err instanceof Error ? err.message : String(err)
        if (!ToolRegistry.SHAPE_COMPLAINT.test(message)) throw err
      }
    }
    throw lastError
  }

  /** Which argument form this browser accepted, once known. */
  get executeToolArgumentForm(): 'string' | 'object' | null {
    return this.argumentForm
  }

  /** Registration failures the browser reported, newest state, by tool name. */
  registrationFailures(): { name: string; reason: string }[] {
    return [...this.failures].map(([name, reason]) => ({ name, reason }))
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export const registry = new ToolRegistry()
