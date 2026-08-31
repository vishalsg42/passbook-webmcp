import { AnimatePresence, motion } from 'framer-motion'
import { FilePlus2, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Finding } from '@/domain/anomalies'
import { formatPaise } from '@/domain/money'
import { addCase } from '@/domain/pack'
import { store } from '@/domain/store'
import { useStore } from './useStore'

/**
 * Findings.
 *
 * Every finding shows its evidence inline: both charges, both bank references,
 * and the reasoning that ruled out a reversal. A number without its evidence is
 * an assertion, and this screen is asking someone to dispute a charge with
 * their bank, so the evidence has to be in front of them.
 */
export function FindingsPanel() {
  const { findings, transactions, coverage, pack } = useStore()
  const duplicates = findings.filter((f) => f.kind === 'duplicate_charge')
  const totalAtStake = duplicates.reduce((sum, f) => sum + (f.amount ?? 0), 0)

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What we found</CardTitle>
        </CardHeader>
        <CardContent className="py-10 text-center text-muted">
          Import a statement and Passbook will look for charges you paid twice.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What we found</CardTitle>
        <span className="num text-[13px] text-muted">
          {duplicates.length} to review
        </span>
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

      {duplicates.length > 0 && (
        <div className="border-b border-line px-5 py-4">
          <p className="m-0 text-[13px] text-muted">Possibly charged twice</p>
          <p className="num m-0 text-[34px] font-semibold leading-tight tracking-tight">
            {formatPaise(totalAtStake)}
          </p>
        </div>
      )}

      <CardContent className="p-0">
        {duplicates.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">
            No duplicate charges found in this statement. That is good news.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {duplicates.map((finding, index) => (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
              >
                <FindingRow
                  finding={finding}
                  drafted={pack.cases.some((c) => c.findingId === finding.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </CardContent>
    </Card>
  )
}

function FindingRow({ finding, drafted }: { finding: Finding; drafted: boolean }) {
  const draft = () => {
    store.update({ pack: addCase(store.get().pack, finding) })
    store.log({
      actor: 'human',
      action: `Drafted a case for ${finding.title}`,
      outcome: 'ok',
    })
  }

  return (
    <div className="border-t border-line px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="min-w-0 flex-1 font-semibold">{finding.title}</span>
        <span className="num text-[17px] font-semibold">{formatPaise(finding.amount ?? 0)}</span>
        <Badge variant={finding.confidence === 'high' ? 'high' : 'medium'}>
          {finding.confidence === 'high' ? 'Likely duplicate' : 'Worth checking'}
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

      <div className="mt-3">
        <Button size="sm" variant={drafted ? 'ghost' : 'outline'} onClick={draft} disabled={drafted}>
          <FilePlus2 />
          {drafted ? 'In the dispute pack' : 'Draft a dispute letter'}
        </Button>
      </div>
    </div>
  )
}
