import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatPaise } from '@/domain/money'
import { useStore } from './useStore'

const PAGE_SIZE = 40

/**
 * The statement itself.
 *
 * Exists so that get_transactions and get_spending_summary have a human
 * equivalent. Every tool has to be doable by clicking, otherwise the agent can
 * reach information a person using the same page cannot, and the claim that
 * this is a product rather than a tool demo stops being true.
 *
 * Rows are paged rather than virtualised: a real statement runs to 1,630 rows,
 * and rendering all of them costs more than it returns.
 */
export function StatementPanel() {
  const { transactions } = useStore()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const totals = useMemo(() => {
    let inflow = 0
    let outflow = 0
    for (const t of transactions) {
      if (t.amount > 0) inflow += t.amount
      else outflow += t.amount
    }
    return { inflow, outflow: Math.abs(outflow) }
  }, [transactions])

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return transactions
    return transactions.filter((t) => t.description.toLowerCase().includes(needle))
  }, [transactions, query])

  if (transactions.length === 0) return null

  const visible = matched.slice(0, limit)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statement</CardTitle>
        <span className="num text-[13px] text-muted">{transactions.length} transactions</span>
      </CardHeader>

      <div className="grid grid-cols-2 border-b border-line">
        <div className="border-r border-line px-5 py-3">
          <p className="m-0 flex items-center gap-1.5 text-[12.5px] text-muted">
            <ArrowDownLeft className="size-3.5 text-signal" aria-hidden />
            Money in
          </p>
          <p className="num m-0 text-[19px] font-semibold">{formatPaise(totals.inflow)}</p>
        </div>
        <div className="px-5 py-3">
          <p className="m-0 flex items-center gap-1.5 text-[12.5px] text-muted">
            <ArrowUpRight className="size-3.5 text-caution" aria-hidden />
            Money out
          </p>
          <p className="num m-0 text-[19px] font-semibold">{formatPaise(totals.outflow)}</p>
        </div>
      </div>

      <div className="border-b border-line px-5 py-3">
        <label htmlFor="txn-search" className="sr-only">
          Search transactions
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            id="txn-search"
            className="pl-9"
            placeholder="Search descriptions"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE_SIZE)
            }}
          />
        </div>
        {query.trim() !== '' && (
          <p className="m-0 mt-2 text-[12.5px] text-muted">
            {matched.length} of {transactions.length} match
          </p>
        )}
      </div>

      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-[14px] text-muted">
            Nothing matches that search.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {visible.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-5 py-2 text-[13px] first:border-t-0"
              >
                <span className="num text-muted">{t.date}</span>
                <span className="truncate" title={t.description}>
                  {t.description}
                </span>
                <span
                  className={`num font-medium ${t.amount > 0 ? 'text-signal' : 'text-ink'}`}
                >
                  {t.amount > 0 ? '+' : ''}
                  {formatPaise(t.amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        {matched.length > visible.length && (
          <button
            className="w-full cursor-pointer border-t border-line px-5 py-3 text-[13px] text-muted transition-colors duration-200 hover:bg-muted-bg hover:text-ink"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, matched.length - visible.length)} more
          </button>
        )}
      </CardContent>
    </Card>
  )
}
