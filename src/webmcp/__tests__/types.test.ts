import { afterEach, describe, expect, it } from 'vitest'
import {
  canInspectToolMap,
  getModelContext,
  getModelContextError,
  isWebMCPAvailable,
} from '../types'

/**
 * A browser can expose document.modelContext and still throw when it is read.
 * ModelContext is [SecureContext] and its operations reject when the agent
 * cluster is not origin-keyed, so the property is not a plain data property
 * and reading it is not guaranteed to be safe.
 *
 * This is not hypothetical. Passbook rendered a blank page in an agent's
 * in-app browser because isWebMCPAvailable is called during render, so a throw
 * there unmounted the whole tree, in the one environment that has no console
 * to read the reason from.
 *
 * The suite runs without a DOM, so document and navigator are installed on
 * globalThis rather than pulling in jsdom for four assertions. Both go through
 * defineProperty: navigator is an accessor on the Node global and cannot be
 * assigned to.
 */

const g = globalThis as unknown as Record<string, unknown>

function install(name: string, value: unknown): void {
  Object.defineProperty(g, name, { configurable: true, writable: true, value })
}

function withModelContext(descriptor: PropertyDescriptor): void {
  const doc = {}
  Object.defineProperty(doc, 'modelContext', { configurable: true, ...descriptor })
  install('document', doc)
  install('navigator', {})
}

afterEach(() => {
  Reflect.deleteProperty(g, 'document')
  Reflect.deleteProperty(g, 'navigator')
})

describe('getModelContext', () => {
  const throwing: PropertyDescriptor = {
    get() {
      throw new Error('SecurityError: the origin is not origin-keyed')
    },
  }

  it('returns null rather than throwing when the getter throws', () => {
    withModelContext(throwing)

    expect(() => getModelContext()).not.toThrow()
    expect(getModelContext()).toBeNull()
    expect(isWebMCPAvailable()).toBe(false)
  })

  it('records why the context could not be read', () => {
    withModelContext(throwing)

    getModelContext()
    expect(getModelContextError()).toContain('SecurityError')
  })

  it('returns the context when the getter works and the shape is complete', () => {
    const fake = { registerTool: () => {}, getTools: () => [], executeTool: () => '' }
    withModelContext({ value: fake, writable: true })

    expect(getModelContext()).toBe(fake)
    expect(isWebMCPAvailable()).toBe(true)
  })

  it('rejects a context that cannot register, whatever else it carries', () => {
    // This used to assert that a context missing executeTool was unusable too.
    // That was wrong, and expensively so: registration needs registerTool and
    // nothing else, and demanding the inspection methods would have refused
    // every registration in a browser that exposes only the one that matters.
    withModelContext({ value: { getTools: () => [] }, writable: true })

    expect(getModelContext()).toBeNull()
    expect(isWebMCPAvailable()).toBe(false)
    expect(getModelContextError()).toContain('registerTool')
  })

  it('reports unavailable when nothing exposes the API', () => {
    install('document', {})
    install('navigator', {})

    expect(getModelContext()).toBeNull()
    expect(isWebMCPAvailable()).toBe(false)
  })
})

/**
 * The shape an agent's in-app browser is documented to expose.
 *
 * OpenAI's integration guide gates on `registerTool` alone: `getTools` and
 * `executeTool` let a *page* inspect and invoke a tool map, and a browser
 * hosting an agent has no obligation to hand either to the page. It discovers
 * registrations through its own internals.
 *
 * Passbook used to require all three, so a browser exposing only registerTool
 * got every registration refused before it was attempted — silently, and in the
 * one environment the project exists to run in.
 */
describe('a context with only registerTool', () => {
  const registerOnly = { registerTool: () => Promise.resolve() }

  it('is usable, because registration is all registration needs', () => {
    withModelContext({ value: registerOnly })
    expect(getModelContext()).not.toBeNull()
    expect(isWebMCPAvailable()).toBe(true)
    expect(getModelContextError()).toBeNull()
  })

  it('reports that the page cannot read its own tool map', () => {
    withModelContext({ value: registerOnly })
    expect(canInspectToolMap()).toBe(false)
  })

  it('reports inspection available when all three are present', () => {
    withModelContext({
      value: {
        registerTool: () => Promise.resolve(),
        getTools: () => Promise.resolve([]),
        executeTool: () => Promise.resolve(''),
      },
    })
    expect(canInspectToolMap()).toBe(true)
    expect(getModelContext()).not.toBeNull()
  })

  it('still rejects a context with no registerTool at all', () => {
    withModelContext({ value: { getTools: () => Promise.resolve([]) } })
    expect(getModelContext()).toBeNull()
    expect(getModelContextError()).toMatch(/no registerTool/)
  })
})
