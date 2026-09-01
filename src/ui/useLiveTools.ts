import { useCallback, useEffect, useState } from 'react'
import { registry } from '@/webmcp/registry'
import { getModelContext, type RegisteredTool } from '@/webmcp/types'

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
 * Refreshes on our own registry changes and on toolchange. toolchange fires at
 * Documents rather than at the agent, and the spec leaves the moment an agent
 * observes the map implementation defined, so the page is the only place that
 * can state the current surface deterministically.
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
    const mc = getModelContext()
    const onToolChange = () => void load()
    mc?.addEventListener('toolchange', onToolChange)
    return () => {
      unsubscribe()
      mc?.removeEventListener('toolchange', onToolChange)
    }
  }, [load])

  return { tools, error, refresh: () => void load() }
}
