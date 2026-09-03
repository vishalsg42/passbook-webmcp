import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { spendingSeries, type Granularity } from '@/domain/insights'
import { formatPaise, type Paise } from '@/domain/money'
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A bucket key as a person would read it, given what the bucket means. */
function bucketLabel(bucket: string, grain: Granularity): string {
  const [y, m, d] = bucket.split('-')
  const month = MONTHS[Number(m) - 1] ?? m
  if (grain === 'month') return `${month} ${y}`
  return `${d} ${month}`
}

/** Compact rupees for an axis, where the exact figure is on the bar's tooltip. */
function axisMoney(paise: Paise): string {
  const rupees = paise / 100
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${Math.round(rupees / 1000)}k`
  return `₹${Math.round(rupees)}`
}

/**
 * Evenly spaced ticks, never more than will fit.
 *
 * Labelling all 28 days overlaps into mush and labelling only the ends is not
 * an axis. First and last are always included so the range stays readable.
 */
function tickIndexes(count: number, max = 6): Set<number> {
  if (count <= max) return new Set(Array.from({ length: count }, (_, i) => i))
  const step = (count - 1) / (max - 1)
  const ticks = new Set<number>()
  for (let i = 0; i < max; i++) ticks.add(Math.round(i * step))
  return ticks
}

export function SpendingChart() {
  const { transactions } = useStore()
  const [grain, setGrain] = useState<Granularity>('day')

  if (transactions.length === 0) return null

  const series = spendingSeries(transactions, grain)
  if (series.length === 0) return null

  const peak = Math.max(...series.map((b) => b.moneyOut))
  const ticks = tickIndexes(series.length)
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
        {/* Gutter for the value axis, then the plot. Gridlines sit behind the
            bars so a height can be read against a number instead of guessed. */}
        <div className="flex gap-2">
          <div className="flex h-40 w-12 shrink-0 flex-col justify-between py-0 text-right text-[11px] text-muted">
            <span className="num leading-none">{axisMoney(peak)}</span>
            <span className="num leading-none">{axisMoney(Math.round(peak / 2))}</span>
            <span className="num leading-none">₹0</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative h-40 border-b border-line">
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute inset-x-0 top-0 border-t border-dashed border-line/70" />
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line/70" />
              </div>

              <div className="relative flex h-full items-stretch gap-[3px]">
                {series.map((b) => (
                  <div
                    key={b.bucket}
                    className="group flex h-full min-w-[4px] flex-1 flex-col justify-end"
                    title={`${bucketLabel(b.bucket, grain)} — ${formatPaise(b.moneyOut)} out, ${b.count} transaction${b.count === 1 ? '' : 's'}`}
                  >
                    <div
                      className="rounded-t-[3px] bg-navy transition-colors group-hover:bg-brand-blue"
                      style={{
                        height: `${peak > 0 ? Math.max((b.moneyOut / peak) * 100, b.moneyOut > 0 ? 2 : 1) : 1}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Ticks sit in the same flex track as the bars, so each label is
                under the bucket it names rather than spread evenly and lying. */}
            {/* The outer two labels are pinned to the row's edges rather than
                centred on their bar. A label is far wider than a bar, so
                centring the last one pushed it 20px past the plot and up
                against the card border — fine at this width, clipped at a
                narrower one. The rest stay centred on the bucket they name. */}
            <div className="relative flex gap-[3px] pt-1.5">
              {series.map((b, i) => {
                if (!ticks.has(i)) return <div key={b.bucket} className="min-w-[4px] flex-1" />
                const edge =
                  i === 0 ? 'absolute left-0' : i === series.length - 1 ? 'absolute right-0' : ''
                return (
                  <div key={b.bucket} className="min-w-[4px] flex-1 text-center">
                    <span
                      className={`num whitespace-nowrap text-[10.5px] leading-none text-muted ${edge}`}
                    >
                      {bucketLabel(b.bucket, grain)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-[11.5px] text-muted">
          {grain === 'day' ? 'Each bar is one day' : grain === 'week' ? 'Each bar is one week, from its Monday' : 'Each bar is one month'}
          {' · hover a bar for the exact figure'}
        </p>

        {/* The bars mean nothing to a screen reader; the figures do. */}
        <p className="sr-only">
          {series.map((b) => `${bucketLabel(b.bucket, grain)}: ${formatPaise(b.moneyOut)}`).join('. ')}
        </p>
      </CardContent>
    </Card>
  )
}
