import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from './button'

/**
 * A right-side drawer for secondary surfaces.
 *
 * Used for the things that explain how Passbook works rather than what it
 * found. They are worth reading and they are not worth half the screen of an
 * app whose subject is somebody's bank statement.
 *
 * Deliberately not a <dialog>: its showModal() makes the rest of the page
 * inert, which is exactly wrong here. The point of these panels is to watch the
 * tool surface change while you work, so the page behind has to stay live and
 * usable.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<Element | null>(null)

  // Held in a ref so the effect below can depend on `open` alone. Depending on
  // `onClose` re-ran it on every render, because callers pass an inline arrow:
  // each run's cleanup fired and put focus back, so by the time the drawer
  // actually closed the remembered element had been overwritten and focus
  // landed on the document instead of the button that opened it.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement
    panel.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Send focus back where it came from, or the keyboard user is stranded
      // at the top of the document.
      ;(returnFocus.current as HTMLElement | null)?.focus?.()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/20"
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-label={title}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[min(30rem,100vw-2rem)] flex-col border-l border-line bg-canvas shadow-[0_0_40px_rgba(15,23,42,0.18)] outline-none"
          >
            <div className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
              <h2 className="m-0 flex-1 text-[15px] font-semibold">{title}</h2>
              <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
                <X />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
