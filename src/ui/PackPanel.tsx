import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Download, Pencil, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { formatPaise } from '@/domain/money'
import { packValue, renderPack, updateCase, type DisputeCase } from '@/domain/pack'
import { store } from '@/domain/store'
import { useStore } from './useStore'

/**
 * The dispute pack.
 *
 * This is the artifact the human and the agent produce together. The agent
 * drafts; the human edits, accepts, or rejects. Nothing reaches the exported
 * document without a human action, and the agent's original draft is kept so
 * the difference between the two stays visible.
 */
export function PackPanel() {
  const { pack } = useStore()
  const accepted = pack.cases.filter((c) => c.status === 'accepted')

  const exportPack = () => {
    const text = renderPack(pack)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dispute-pack-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    store.log({
      actor: 'human',
      action: `Exported dispute pack with ${accepted.length} case(s)`,
      outcome: 'ok',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dispute pack</CardTitle>
        {accepted.length > 0 && (
          <span className="num text-[13px] text-muted">{formatPaise(packValue(pack))}</span>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {pack.cases.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">
            Nothing drafted yet. Draft a letter from a finding, or ask your agent to do it.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {pack.cases.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <CaseRow entry={entry} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </CardContent>

      {accepted.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line px-5 py-4">
          <Button onClick={exportPack}>
            <Download />
            Export {accepted.length} case{accepted.length === 1 ? '' : 's'}
          </Button>
          <span className="text-[13px] text-muted">
            A plain text letter you can send to your bank.
          </span>
        </div>
      )}
    </Card>
  )
}

function CaseRow({ entry }: { entry: DisputeCase }) {
  const body = entry.committed ?? entry.draft
  const [editing, setEditing] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [text, setText] = useState(body.narrative)
  const edited = entry.committed !== null && entry.committed.narrative !== entry.draft.narrative

  // Rejecting used to record only the status, so a case set aside here left no
  // trace of why — while the same decision made through dismiss_candidate or in
  // the findings list requires a reason. Three routes to one outcome should not
  // disagree about what gets written down.
  const commit = (status: 'accepted' | 'rejected', reason?: string) => {
    const rejectionReason =
      status === 'rejected' ? (reason?.trim() || 'Set aside by the account holder') : undefined

    store.update({
      pack: updateCase(store.get().pack, entry.id, {
        status,
        committed: { ...body, narrative: text },
        ...(rejectionReason ? { rejectionReason } : {}),
      }),
    })
    store.log({
      actor: 'human',
      action: `${status === 'accepted' ? 'Accepted' : 'Rejected'} case for ${body.merchant}`,
      outcome: 'ok',
      detail:
        rejectionReason ??
        (edited || text !== entry.draft.narrative ? 'Edited the drafted letter' : undefined),
    })
    setRejecting(false)
    setReason('')
    setEditing(false)
  }

  return (
    <div className="border-t border-line px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="min-w-0 flex-1 font-semibold">{body.merchant}</span>
        <span className="num text-[15px] font-semibold">{formatPaise(body.amount)}</span>
        <Badge
          variant={
            entry.status === 'accepted'
              ? 'accepted'
              : entry.status === 'rejected'
                ? 'neutral'
                : 'proposed'
          }
        >
          {entry.status === 'proposed'
            ? 'Drafted, awaiting you'
            : entry.status === 'accepted'
              ? 'In the pack'
              : 'Not disputing'}
        </Badge>
      </div>

      <p className="mt-1 text-[13px] text-muted">
        Charged {body.dates.join(' and ')} · references {body.references.join(', ')}
      </p>

      {editing ? (
        <div className="mt-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="accept" onClick={() => commit('accepted')}>
              <Check />
              Save and accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setText(body.narrative)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <pre className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-muted-bg px-3 py-2.5 font-sans text-[13px] leading-relaxed text-ink">
            {body.narrative}
          </pre>

          {edited && (
            <p className="mt-2 text-[12.5px] text-muted">
              You edited the letter the agent drafted.
            </p>
          )}

          {entry.status === 'proposed' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="accept" onClick={() => commit('accepted')}>
                <Check />
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil />
                Edit first
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>
                <X />
                Not this one
              </Button>
            </div>
          )}

          {rejecting && (
            <div className="mt-3 rounded-[10px] border border-line bg-muted-bg p-3">
              <label
                htmlFor={`pack-why-${entry.id}`}
                className="mb-2 block text-[13px] font-medium text-ink"
              >
                Why are you setting this one aside?
              </label>
              <Input
                id={`pack-why-${entry.id}`}
                value={reason}
                autoFocus
                placeholder="I meant to pay twice"
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commit('rejected', reason)}
              />
              <p className="mb-0 mt-2 text-[12.5px] text-muted">
                Kept with the case, so the pack records why. Optional.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="danger" onClick={() => commit('rejected', reason)}>
                  Set aside
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
