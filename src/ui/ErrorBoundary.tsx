import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence against a white page.
 *
 * The boot shell in index.html covers failures before React mounts. This
 * covers failures after it, which would otherwise unmount the tree and leave
 * the same blank screen with nothing to read.
 *
 * It matters more here than in most apps because Passbook is meant to be
 * opened inside an agent's in-app browser, where the reader has no devtools
 * and no console. If the page cannot say what went wrong, nobody can find out.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[passbook] render failed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <h1 className="m-0 mb-2 text-xl font-semibold">Passbook stopped</h1>
        <p className="m-0 mb-3 text-muted">
          Something failed while drawing the page. Your imported statement is still in this
          browser, so reloading usually recovers it. If it does not, Start over clears the stored
          state.
        </p>
        <pre className="m-0 mb-4 overflow-x-auto whitespace-pre-wrap break-words rounded-[10px] border border-line bg-muted-bg p-3 text-[12.5px] text-danger">
          {error.stack ?? error.message}
        </pre>
        <button
          className="cursor-pointer rounded-[10px] border border-line px-4 py-2 text-[14px] transition-colors duration-200 hover:bg-muted-bg"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    )
  }
}
