import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { loadDemoStatement } from '@/domain/demo'
import { SEED_LABEL } from '@/domain/seed'
import { store } from '@/domain/store'
import { useStore } from './useStore'

/**
 * Which statement Passbook is working on.
 *
 * This replaced a ghost "Start over" button, which was wrong in three ways.
 *
 * It named the destruction rather than the destination. Someone looking at
 * sample data has exactly one question — does this work on MY statement — and
 * "Start over" is not an answer to it. Controls are labelled by what the person
 * gets, never by what happens to the app.
 *
 * It hid itself once the app was empty, because the whole header block was
 * behind `transactions.length > 0`. So pressing it removed the only way back to
 * the demo, and the actual way back was a button further down the page that
 * most people never scrolled to.
 *
 * And it made retreat invisible. Uploading a real bank statement is a
 * high-anxiety action, and people only try those when they can see the way
 * back before they commit. Two labelled segments say "you can return" without
 * spending a word on it; a one-way button cannot.
 *
 * Switching away from real work asks first, inline. Never `confirm()`: a
 * browser modal blocks the event loop in the in-app browsers this is built for.
 */

type Mode = 'demo' | 'own'

export function StatementModeSwitch() {
  const { statementLabel, pack } = useStore()
  const reduceMotion = useReducedMotion()
  const [pending, setPending] = useState<Mode | null>(null)

  const mode: Mode = statementLabel === SEED_LABEL ? 'demo' : 'own'

  // What a switch would actually destroy. The demo is one click to rebuild and
  // an imported file still sits on the person's disk, so neither is worth a
  // prompt on its own. Drafted cases are the only thing that exists nowhere
  // else, and losing those silently is unforgivable in a fintech app.
  const casesAtRisk = pack.cases.length

  const apply = (next: Mode) => {
    setPending(null)
    if (next === 'demo') {
      loadDemoStatement()
      return
    }
    store.reset()
    store.log({ actor: 'human', action: 'Cleared the demo to import a statement', outcome: 'ok' })
    // Send attention where the next action is. Without this the page simply
    // empties and the person has to work out where to go.
    window.requestAnimationFrame(() => {
      document.getElementById('choose-statement')?.focus()
    })
  }

  const choose = (next: Mode) => {
    if (next === mode) return
    if (casesAtRisk > 0) {
      setPending(next)
      return
    }
    apply(next)
  }

  // Escape cancels, like any other transient confirmation.
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPending(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  return (
    // Anchored, not stacked. Rendered in flow, this confirmation pushed the
    // whole page down and left a dead gap beside the header; a transient
    // question about one control belongs over the page, attached to it.
    <div className="relative">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div
          role="radiogroup"
          aria-label="Which statement to work on"
          className="inline-flex rounded-[10px] border border-line bg-muted-bg p-0.5"
        >
          {(
            [
              ['demo', 'Demo data'],
              ['own', 'My statement'],
            ] as [Mode, string][]
          ).map(([value, label]) => {
            const active = mode === value
            return (
              <button
                key={value}
                role="radio"
                aria-checked={active}
                onClick={() => choose(value)}
                className="relative min-h-11 rounded-[8px] px-3.5 text-[13px] font-medium transition-colors"
              >
                {active && (
                  <motion.span
                    layoutId="statement-mode-pill"
                    // Motion here carries meaning: the pill travelling shows the
                    // two states are one control, not two buttons.
                    transition={
                      reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                    className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
                  />
                )}
                <span className={`relative ${active ? 'text-ink' : 'text-muted'}`}>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {pending && (
          <motion.div
            role="alertdialog"
            aria-label="Confirm switching statement"
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full z-20 mt-2 w-[min(21rem,calc(100vw-2.5rem))] rounded-[10px] border border-[#f0dcb8] bg-[#fdf3e3] px-4 py-3 text-left text-[13px] shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            <strong className="block font-semibold text-caution">
              {casesAtRisk} drafted {casesAtRisk === 1 ? 'case' : 'cases'} will be discarded
            </strong>
            <span className="text-muted">
              Your dispute pack only exists in this browser. Export it first if you want to keep it.
            </span>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="outline" autoFocus onClick={() => apply(pending)}>
                Switch anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
