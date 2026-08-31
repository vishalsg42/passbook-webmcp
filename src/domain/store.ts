import type { Finding } from './anomalies'
import { emptyPack, type DisputePack } from './pack'
import type { Coverage, Transaction } from './types'

/**
 * Application state and persistence.
 *
 * Persisted to localStorage under a versioned key so a schema change cannot
 * silently load stale data. Writes are wrapped: setItem throws
 * QuotaExceededError synchronously and atomically, so a failed write must be
 * surfaced rather than leaving memory and disk quietly disagreeing.
 *
 * The audit log is capped and rotating. An unbounded append only log is a slow
 * leak into a quota that also holds the transactions.
 */

const STORAGE_KEY = 'passbook.v1'
const MAX_AUDIT_ENTRIES = 500

export interface AuditEntry {
  at: string
  actor: 'human' | 'agent'
  action: string
  /** Exactly which fields left the page. Records what the page emitted; it
   *  cannot record what the agent retained. */
  fields?: string[]
  outcome: 'ok' | 'blocked' | 'error'
  detail?: string
}

export interface AppState {
  transactions: Transaction[]
  findings: Finding[]
  coverage: Coverage | null
  pack: DisputePack
  audit: AuditEntry[]
  statementLabel: string | null
}

export function emptyState(): AppState {
  return {
    transactions: [],
    findings: [],
    coverage: null,
    pack: emptyPack(),
    audit: [],
    statementLabel: null,
  }
}

export class Store {
  private state: AppState = emptyState()
  private listeners = new Set<() => void>()
  /** Set when a persist fails, so the UI can tell the truth about it. */
  persistError: string | null = null

  constructor() {
    this.load()
    // Another tab writing the same key must not leave this tab stale.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.load()
          this.emit()
        }
      })
    }
  }

  get(): AppState {
    return this.state
  }

  update(change: Partial<AppState>): void {
    this.state = { ...this.state, ...change }
    this.persist()
    this.emit()
  }

  log(entry: Omit<AuditEntry, 'at'>): void {
    const audit = [{ at: new Date().toISOString(), ...entry }, ...this.state.audit].slice(
      0,
      MAX_AUDIT_ENTRIES,
    )
    this.state = { ...this.state, audit }
    this.persist()
    this.emit()
  }

  reset(): void {
    this.state = emptyState()
    try {
      localStorage.removeItem(STORAGE_KEY)
      this.persistError = null
    } catch {
      // Removal failing is not worth surfacing; the in-memory reset stands.
    }
    this.emit()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
      this.persistError = null
    } catch (err) {
      // Atomic failure: nothing was written. Say so rather than pretending.
      this.persistError =
        err instanceof Error && err.name === 'QuotaExceededError'
          ? 'Browser storage is full, so the last change was not saved. Export your pack and reset the demo.'
          : 'The last change could not be saved to browser storage.'
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<AppState>
      this.state = { ...emptyState(), ...parsed }
    } catch {
      // Corrupt payload: start clean rather than crashing on boot.
      this.state = emptyState()
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export const store = new Store()
