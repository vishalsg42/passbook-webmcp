import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { spendingSeries, type Granularity } from '@/domain/insights'
import { formatPaise } from '@/domain/money'
import { useStore } from './useStore'

/**
 * Spending over time.
 *
 * Exists because `get_spending_series` had no human equivalent, and this
 * project's rule is that anything the agent can do, a person can do by
 * clicking. An agent that could chart a year while the page could not was the
 * rule broken in the one place it is easiest to notice.
 *
 * Drawn with divs rather than a charting library: the whole thing is one bar
 * per bucket, and a dependency for that would cost more in bundle than it
 * returns in fidelity.
 *
 * Bars carry a title attribute and the axis is labelled in words, because the
 * height of a bar is not readable to a screen reader and the numbers are the
 * point.
 */
const GRAINS: { id: Granularity; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

export function SpendingChart() {
  const { transactions } = useStore()
  const [grain, setGrain] = useState<Granularity>('day')

  if (transactions.length === 0) return null

  const series = spendingSeries(transactions, grain)
  if (series.length === 0) return null

  const peak = Math.max(...series.map((b) => b.moneyOut))
  const total = series.reduce((n, b) => n + b.moneyOut, 0)

  return (
    <Card>
      <CardHeader>
        <TrendingUp className="size-4 text-muted" aria-hidden />
        <CardTitle>Spending over time</CardTitle>
        <div
          role="radiogroup"
          aria-label="Bucket size"
          className="ml-auto inline-flex rounded-[8px] border border-line bg-muted-bg p-0.5"
        >
          {GRAINS.map((g) => (
            <button
              key={g.id}
              role="radio"
              aria-checked={grain === g.id}
              onClick={() => setGrain(g.id)}
              className={`rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                grain === g.id ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(15,23,42,0.1)]' : 'text-muted'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <div className="border-b border-line bg-muted-bg px-5 py-2.5 text-[12.5px] text-muted">
        <b className="num font-semibold text-ink">{formatPaise(total)}</b> out across{' '}
        <b className="num font-semibold text-ink">{series.length}</b>{' '}
        {grain === 'day' ? 'days' : grain === 'week' ? 'weeks' : 'months'} with activity. Tallest bar
        is <b className="num font-semibold text-ink">{formatPaise(peak)}</b>. Periods with nothing
        in them are left out rather than drawn as zero.
      </div>

      <CardContent>
        {/* items-stretch, not items-end. A percentage height resolves against
            the parent's height, and items-end leaves each wrapper at its
            content height — which is zero, so every bar rendered invisible. */}
        <div className="flex h-40 items-stretch gap-[3px] overflow-x-auto pb-1">
          {series.map((b) => (
            <div
              key={b.bucket}
              className="group flex h-full min-w-[6px] flex-1 flex-col justify-end"
              title={`${b.bucket}: ${formatPaise(b.moneyOut)} out, ${b.count} transaction${b.count === 1 ? '' : 's'}`}
            >
              {/* No entrance animation. Two attempts at one — animating height,
                  then scaleY — both left every bar stuck at its initial value on
                  the deployed build, and a chart that sometimes renders nothing
                  is worth strictly less than a chart that never moves. The
                  motion here was decorative rather than explanatory, which is
                  the kind this project is supposed to leave out. */}
              <div
                className="rounded-t-[3px] bg-navy transition-colors group-hover:bg-brand-blue"
                style={{
                  height: `${peak > 0 ? Math.max((b.moneyOut / peak) * 100, b.moneyOut > 0 ? 2 : 1) : 1}%`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-2 flex justify-between text-[11.5px] text-muted">
          <span className="num">{series[0].bucket}</span>
          <span className="num">{series[series.length - 1].bucket}</span>
        </div>

        {/* The bars are decorative to a screen reader; the figures are not. */}
        <p className="sr-only">
          {series.map((b) => `${b.bucket}: ${formatPaise(b.moneyOut)}`).join('. ')}
        </p>
      </CardContent>
    </Card>
  )
}
