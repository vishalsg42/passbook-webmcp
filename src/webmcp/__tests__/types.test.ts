import { afterEach, describe, expect, it } from 'vitest'
import { getModelContext, getModelContextError, isWebMCPAvailable } from '../types'

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

  it('returns the context when the getter works', () => {
    const fake = { getTools: () => [] }
    withModelContext({ value: fake, writable: true })

    expect(getModelContext()).toBe(fake)
    expect(isWebMCPAvailable()).toBe(true)
  })

  it('reports unavailable when nothing exposes the API', () => {
    install('document', {})
    install('navigator', {})

    expect(getModelContext()).toBeNull()
    expect(isWebMCPAvailable()).toBe(false)
  })
})
