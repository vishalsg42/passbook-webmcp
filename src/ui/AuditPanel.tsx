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
 */
export function AuditPanel() {
  const { audit } = useStore()

  return (
    <Card>
      <CardHeader>
        <ScrollText className="size-4 text-muted" aria-hidden />
        <CardTitle>Activity</CardTitle>
        <span className="num text-[13px] text-muted">{audit.length}</span>
      </CardHeader>
      <CardContent className="p-0">
        {audit.length === 0 ? (
          <p className="px-5 py-8 text-center text-[14px] text-muted">Nothing has happened yet.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {audit.map((entry, i) => (
              <div
                key={`${entry.at}-${i}`}
                className="grid grid-cols-[58px_54px_minmax(0,1fr)] items-baseline gap-3 border-t border-line px-5 py-2 text-[12.5px] text-muted first:border-t-0"
              >
                <span className="num">{entry.at.slice(11, 19)}</span>
                <span className={entry.actor === 'agent' ? 'text-brand-blue' : 'text-muted'}>
                  {entry.actor}
                </span>
                <span className="truncate text-ink" title={entry.detail ?? entry.action}>
                  {entry.action}
                  {entry.outcome !== 'ok' && (
                    <span className="text-danger"> ({entry.outcome})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
