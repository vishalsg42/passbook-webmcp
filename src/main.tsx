import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

// The boot shell lives inside #root so that a mount replaces it. Clearing it
// explicitly keeps that true even if React's first commit is a portal or an
// empty fragment, which would otherwise leave the shell on screen behind the app.
root.replaceChildren()

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
