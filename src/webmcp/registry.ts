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

    // Aborting the signal rejects this promise with the abort reason. That is
    // expected during a swap or an unregister, so it is swallowed rather than
    // surfaced. Any other rejection is a real bug and is reported.
    mc.registerTool(descriptor, { signal: controller.signal }).catch((err: unknown) => {
      if (controller.signal.aborted) return
      console.error(`[passbook] registerTool failed for "${descriptor.name}"`, err)
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
   *  pass. Used when application state changes which tools should exist. */
  sync(descriptors: ToolDescriptor<never>[]): void {
    const wanted = new Set(descriptors.map((d) => d.name))
    for (const name of [...this.entries.keys()]) {
      if (!wanted.has(name)) this.unregister(name)
    }
    for (const descriptor of descriptors) {
      if (!this.entries.has(descriptor.name)) this.register(descriptor)
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

  /** Invoke a registered tool through the browser, exactly as an agent would.
   *  This is both the in-page agent path and the day-one verification path.
   *
   *  Verified against Chrome 151: `executeTool` takes its arguments as a JSON
   *  **string**. Passing a plain object rejects with
   *  `UnknownError: Failed to parse input arguments`. The browser parses the
   *  string and hands the resulting object to `execute`.
   *
   *  The tool must also be the `RegisteredTool` returned by `getTools()`. It
   *  carries a required `origin` member, and a hand-built object literal throws
   *  a TypeError before execution is attempted. */
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
    return mc.executeTool(tool, JSON.stringify(input ?? {}))
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
