import { useEffect, useState } from 'react'
import { store, type AppState } from '../domain/store'

/** Subscribe a component to the store. */
export function useStore(): AppState {
  const [state, setState] = useState<AppState>(() => store.get())
  useEffect(() => store.subscribe(() => setState(store.get())), [])
  return state
}
