import { motion } from 'framer-motion'
import { PieChart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { concentration, topCounterparties, totalOut } from '@/domain/insights'
import { formatPaise } from '@/domain/money'
import { useStore } from './useStore'

/**
 * Where the money went.
 *
 * The honest headline of this product. Passbook cannot tell you which charges
 * were mistakes — audited against a real 1,630-row statement, every candidate
 * it surfaced turned out to be intentional. What it can tell you, having read
 * every row and reconciled each one against the printed running balance, is
 * where the money actually goes. Nobody learns that from a 154-page PDF, and it
 * needs no guess about anyone's intent.
 *
 * Bars are drawn from the share, so the longest is the largest payee rather
 * than a fixed scale, and the numbers sit beside them for anyone who cannot
 * read length.
 */
export function InsightsPanel() {
  const { transactions } = useStore()
  if (transactions.length === 0) return null

  const top = topCounterparties(transactions)
  if (top.length === 0) return null

  const out = totalOut(transactions)
  const head = concentration(transactions, top.length)
  const widest = top[0].share

  return (
    <Card>
      <CardHeader>
        <PieChart className="size-4 text-muted" aria-hidden />
        <CardTitle>Where your money went</CardTitle>
        <span className="num text-[13px] text-muted">{formatPaise(out)} out</span>
      </CardHeader>

      <div className="border-b border-line bg-muted-bg px-5 py-2.5 text-[12.5px] text-muted">
        These {top.length} counterparties are{' '}
        <b className="num font-semibold text-ink">{Math.round(head * 100)}%</b> of everything that
        left the account across{' '}
        <b className="num font-semibold text-ink">{transactions.length}</b> rows.
      </div>

      <CardContent className="p-0">
        {top.map((c, i) => (
          <div key={c.merchant} className="border-t border-line px-5 py-3 first:border-t-0">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-[14px]" title={c.merchant}>
                {c.merchant}
              </span>
              <span className="num text-[13px] text-muted">
                {c.count} {c.count === 1 ? 'payment' : 'payments'}
              </span>
              <span className="num text-[15px] font-semibold">{formatPaise(c.total)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted-bg">
              <motion.div
                className="h-full rounded-full bg-navy"
                initial={{ width: 0 }}
                animate={{ width: `${(c.share / widest) * 100}%` }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.3), ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
