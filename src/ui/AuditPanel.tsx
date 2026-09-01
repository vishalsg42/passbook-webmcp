import { ScrollText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStore } from './useStore'

/**
 * The audit log.
 *
 * Records what the page emitted, including the exact field set each tool
 * returned. It deliberately does not claim to record what the agent retained:
 * observations bypass execute entirely, so no page can honestly make that
 * claim.
 *
 * The field chips are the visible half of that. Every read tool already records
 * the keys it put in its result, and showing them is what turns "data
 * minimisation" from a sentence in a README into something a reader can check
 * against the tool they just watched run.
 */
export function AuditPanel() {
  const { audit } = useStore()
  const emitted = audit.some((entry) => entry.fields && entry.fields.length > 0)

  return (
    <Card>
      <CardHeader>
        <ScrollText className="size-4 text-muted" aria-hidden />
        <CardTitle>Activity</CardTitle>
        <span className="num text-[13px] text-muted">{audit.length}</span>
      </CardHeader>

      {emitted && (
        <div className="border-b border-line bg-muted-bg px-5 py-2.5 text-[12px] leading-relaxed text-muted">
          Chips are the exact fields the page returned to the agent. Passbook cannot record what the
          agent then kept, so it does not claim to.
        </div>
      )}

      <CardContent className="p-0">
        {audit.length === 0 ? (
          <p className="px-5 py-8 text-center text-[14px] text-muted">Nothing has happened yet.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {audit.map((entry, i) => (
              <div
                key={`${entry.at}-${i}`}
                className="grid grid-cols-[58px_54px_minmax(0,1fr)] items-start gap-3 border-t border-line px-5 py-2 text-[12.5px] text-muted first:border-t-0"
              >
                <span className="num">{entry.at.slice(11, 19)}</span>
                <span className={entry.actor === 'agent' ? 'text-brand-blue' : 'text-muted'}>
                  {entry.actor}
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-ink" title={entry.detail ?? entry.action}>
                    {entry.action}
                    {entry.outcome !== 'ok' && (
                      <span className="text-danger"> ({entry.outcome})</span>
                    )}
                  </span>
                  {entry.fields && entry.fields.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {entry.fields.map((field) => (
                        <code
                          key={field}
                          className="num rounded border border-line bg-surface px-1.5 py-px text-[11px] text-muted"
                        >
                          {field}
                        </code>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
