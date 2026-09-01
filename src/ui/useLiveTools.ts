import { useCallback, useEffect, useState } from 'react'
import { registry } from '@/webmcp/registry'
import type { RegisteredTool } from '@/webmcp/types'

/**
 * What the browser actually has registered, read back through getTools.
 *
 * Deliberately not derived from our own list of tool descriptors. The static
 * list cannot answer the question the UI is asking, because the registered set
 * varies with the state of the app and includes the permanently registered
 * explainer stub that no feature module owns. Counting descriptors instead of
 * reading the tool map is how the agent panel came to advertise seven tools on
 * a page that had eight.
 *
 * Refreshes on our own registry changes and on toolchange. The spec fires
 * toolchange at the Document, not at the ModelContext, so that is where the
 * listener goes. Attaching it to the ModelContext happened to work in Chrome,
 * whose ModelContext is an EventTarget, and threw
 * "addEventListener is not a function" in an agent's in-app browser, which
 * exposes the object without EventTarget on it. The Document is always an
 * EventTarget, so this is both the correct target and the safe one.
 *
 * The spec also leaves the moment an agent observes the map
 * implementation defined, so the page is the only place that can state the
 * current surface deterministically.
 */
export function useLiveTools(): {
  tools: RegisteredTool[]
  error: string | null
  refresh: () => void
} {
  const [tools, setTools] = useState<RegisteredTool[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setTools(await registry.getLiveTools())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubscribe = registry.onChange(() => void load())
    const onToolChange = () => void load()
    document.addEventListener('toolchange', onToolChange)
    return () => {
      unsubscribe()
      document.removeEventListener('toolchange', onToolChange)
    }
  }, [load])

  return { tools, error, refresh: () => void load() }
}
