import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, FilePlus2, ShieldCheck, TrendingDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Finding } from '@/domain/anomalies'
import { formatPaise } from '@/domain/money'
import { addCase, updateCase } from '@/domain/pack'
import { store } from '@/domain/store'
import { useStore } from './useStore'

/**
 * Findings.
 *
 * Every finding shows its evidence inline: both charges, both bank references,
 * and the reasoning that ruled out a reversal. A number without its evidence is
 * an assertion, and this screen is asking someone to dispute a charge with
 * their bank, so the evidence has to be in front of them.
 *
 * Candidates lead because they are the only thing here that needs a decision.
 * Standing commitments and overdraft risk follow: worth knowing, nothing to
 * answer. Note what these are NOT — an audit against the real statement found
 * all nine were intentional payments, so this is a review queue and never a
 * claim that money is owed back.
 */
export function FindingsPanel() {
  const { findings, transactions, coverage, pack } = useStore()
  const duplicates = findings.filter((f) => f.kind === 'duplicate_charge')
  const others = findings.filter((f) => f.kind !== 'duplicate_charge')
  const dismissedIds = new Set(
    pack.cases.filter((c) => c.status === 'rejected').map((c) => c.findingId),
  )
  const live = duplicates.filter((f) => !dismissedIds.has(f.id))
  const totalAtStake = live.reduce((sum, f) => sum + (f.amount ?? 0), 0)

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What we found</CardTitle>
        </CardHeader>
        <CardContent className="py-10 text-center text-muted">
          Import a statement and Passbook will read every row, then show you the few worth a
          second look.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What we found</CardTitle>
        <span className="num text-[13px] text-muted">{live.length} to review</span>
      </CardHeader>

      {coverage && (
        <div className="flex flex-wrap gap-5 border-b border-line bg-muted-bg px-5 py-3 text-[12.5px] text-muted">
          <span>
            Read <b className="num font-semibold text-ink">{coverage.rowsParsed}</b> of{' '}
            <b className="num font-semibold text-ink">{coverage.rowsDetected}</b> rows
          </span>
          <span>
            Across <b className="num font-semibold text-ink">{coverage.pageCount}</b> pages
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck
              className={`size-3.5 ${coverage.chainIntact ? 'text-signal' : 'text-caution'}`}
              aria-hidden
            />
            Balance chain {coverage.chainIntact ? 'checks out' : 'has gaps'}
          </span>
        </div>
      )}

      {/* The count leads, not the money. This used to headline the total as
          "Possibly charged twice", which reads as a sum you are owed. Audited
          against the owner's real statement, every one of the nine pairs it
          surfaced was an intentional payment. What Passbook can honestly claim
          is the narrowing: this many rows, this few worth reading. */}
      {live.length > 0 && (
        <div className="border-b border-line px-5 py-4">
          <p className="m-0 text-[13px] text-muted">
            Worth a second look, out of{' '}
            <b className="num font-semibold text-ink">{transactions.length}</b> rows
          </p>
          <p className="num m-0 text-[34px] font-semibold leading-tight tracking-tight">
            {live.length}
          </p>
          <p className="m-0 mt-1 text-[13px] text-muted">
            <b className="num font-semibold text-ink">{formatPaise(totalAtStake)}</b> across them.
            Passbook cannot tell which were intended &mdash; you can.
          </p>
        </div>
      )}

      <CardContent className="p-0">
        {live.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">
            Nothing left to review.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {live.map((finding, index) => (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
              >
                <FindingRow
                  finding={finding}
                  drafted={pack.cases.some(
                    (c) => c.findingId === finding.id && c.status !== 'rejected',
                  )}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </CardContent>

      {others.length > 0 && <OtherFindings findings={others} />}
    </Card>
  )
}

function FindingRow({ finding, drafted }: { finding: Finding; drafted: boolean }) {
  const [dismissing, setDismissing] = useState(false)
  const [reason, setReason] = useState('')

  const draft = () => {
    store.update({ pack: addCase(store.get().pack, finding) })
    store.log({ actor: 'human', action: `Drafted a case for ${finding.title}`, outcome: 'ok' })
  }

  // The human equivalent of the agent's dismiss_candidate tool. Every tool has
  // to be doable by clicking, or the agent can reach states a person cannot.
  //
  // dismiss_candidate requires a reason, so this has to be able to carry one
  // too. Without it the page asks the account holder what it does not know and
  // then gives them nowhere to say it, and every human dismissal lands in the
  // pack under the same constant sentence.
  const dismiss = (reason: string) => {
    const state = store.get()
    const rejectionReason =
      reason.trim() === '' ? 'The account holder meant to pay twice' : reason.trim()
    const existing = state.pack.cases.find((c) => c.findingId === finding.id)
    const pack = existing
      ? updateCase(state.pack, existing.id, { status: 'rejected', rejectionReason })
      : updateCase(addCase(state.pack, finding), `case-${finding.id}`, {
          status: 'rejected',
          rejectionReason,
        })
    store.update({ pack })
    store.log({
      actor: 'human',
      action: `Set aside ${finding.title}`,
      outcome: 'ok',
      detail: rejectionReason,
    })
  }

  return (
    <div className="border-t border-line px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="min-w-0 flex-1 font-semibold">{finding.title}</span>
        <span className="num text-[17px] font-semibold">{formatPaise(finding.amount ?? 0)}</span>
        <Badge variant={finding.confidence === 'high' ? 'high' : 'medium'}>
          {finding.confidence === 'high' ? 'Same day, same amount' : 'Worth checking'}
        </Badge>
      </div>

      <div className="mt-3 overflow-hidden rounded-[10px] border border-line">
        {finding.evidence.map((t) => (
          <div
            key={t.id}
            className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-3 py-2 text-[13px] first:border-t-0"
          >
            <span className="num text-muted">{t.date}</span>
            <span className="truncate text-muted" title={t.description}>
              {t.description}
            </span>
            <span className="num font-medium">{formatPaise(Math.abs(t.amount))}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-[10px] bg-muted-bg px-3 py-2.5 text-[13px] text-muted">
        {finding.reasoning}
      </p>

      {/* The human half of the question get_duplicate_candidates puts to the
          agent. Passbook has the ledger and not the account holder's memory, so
          on a medium confidence candidate it says so to whoever is looking,
          rather than only to the agent. */}
      {!drafted && (
        <p className="mt-2 px-3 text-[13px] text-muted">
          Passbook cannot settle this from the statement alone. If you remember something it does
          not &mdash; you meant to pay twice, or a refund was promised &mdash; that decides it.
        </p>
      )}

      {/* Both buttons answer the question above, and the order matters: on the
          only real statement this was measured against, nine out of nine were
          intentional, so the common answer goes first. "Not a duplicate" was
          the old wording, and it invited drafting a dispute for a charge nobody
          had said was wrong. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {!drafted && !dismissing && (
          <Button size="sm" variant="outline" onClick={() => setDismissing(true)}>
            <X />
            I meant to pay twice
          </Button>
        )}
        <Button size="sm" variant={drafted ? 'ghost' : 'outline'} onClick={draft} disabled={drafted}>
          <FilePlus2 />
          {drafted ? 'In the dispute pack' : "I didn't authorise the second one"}
        </Button>
      </div>

      {dismissing && (
        <div className="mt-3 rounded-[10px] border border-line bg-muted-bg p-3">
          <label
            htmlFor={`why-${finding.id}`}
            className="mb-2 block text-[13px] font-medium text-ink"
          >
            What do you remember about it?
          </label>
          <Input
            id={`why-${finding.id}`}
            value={reason}
            autoFocus
            placeholder="Bought a second month of the same thing"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dismiss(reason)}
          />
          <p className="mb-0 mt-2 text-[12.5px] text-muted">
            Kept with the case, so the pack records why it was set aside. Optional.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => dismiss(reason)}>
              Set it aside
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Context worth knowing, but not something to dispute. */
function OtherFindings({ findings }: { findings: Finding[] }) {
  const commitments = findings.filter((f) => f.kind === 'standing_commitment')
  const overdraft = findings.filter((f) => f.kind === 'overdraft_risk')

  return (
    <div className="border-t border-line">
      <div className="px-5 pb-1 pt-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Also worth knowing
        </p>
      </div>

      {overdraft.map((f) => (
        <div key={f.id} className="flex gap-3 px-5 py-3">
          <TrendingDown className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
          <div className="min-w-0">
            <p className="m-0 text-[14px] font-medium">{f.title}</p>
            <p className="m-0 text-[13px] text-muted">{f.reasoning}</p>
          </div>
        </div>
      ))}

      {commitments.length > 0 && <Commitments findings={commitments} />}
    </div>
  )
}

/**
 * Standing commitments, with the multiplication nobody does.
 *
 * The amount on the row is what leaves each time; the number that changes
 * anyone's mind is what it comes to in a year. Both are shown, and the yearly
 * figure is labelled a projection wherever it appears, because it is one:
 * it assumes the cadence already observed simply continues.
 */
function Commitments({ findings }: { findings: Finding[] }) {
  const yearly = findings.reduce((sum, f) => sum + (f.projectedAnnual ?? 0), 0)

  return (
    <div className="flex gap-3 px-5 pb-4 pt-3">
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] font-medium">
          {findings.length} standing commitment{findings.length === 1 ? '' : 's'} leave before you
          look
        </p>
        {yearly > 0 && (
          <p className="m-0 mt-0.5 text-[13px] text-muted">
            About <b className="num font-semibold text-ink">{formatPaise(yearly)}</b> a year between
            them, if they carry on at the rate the statement shows.
          </p>
        )}

        <div className="mt-2 space-y-1.5">
          {findings.slice(0, 4).map((f) => (
            <div key={f.id} className="flex items-baseline gap-3 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-muted" title={f.title}>
                {f.title}
              </span>
              <span className="num text-muted">{formatPaise(f.amount ?? 0)} each</span>
              {f.projectedAnnual ? (
                <span className="num font-medium">{formatPaise(f.projectedAnnual)}/yr</span>
              ) : null}
            </div>
          ))}
          {findings.length > 4 && (
            <p className="m-0 text-[12.5px] text-muted">and {findings.length - 4} more</p>
          )}
        </div>
      </div>
    </div>
  )
}
