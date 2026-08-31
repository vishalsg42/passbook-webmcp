import type { Paise } from './money'

export type BankId = 'hdfc' | 'kotak' | 'rbl'

export interface Transaction {
  id: string
  accountId: string
  /** Plain YYYY-MM-DD. Never a Date object: constructing one and calling
   *  toISOString shifts every IST date back a day, which would silently move
   *  transactions across month boundaries. */
  date: string
  /** Value date where the statement provides one, else the same as `date`. */
  valueDate: string
  /** Full narration, with continuation lines joined. */
  description: string
  /** Bank reference: Chq./Ref.No. (HDFC), Chq/Ref. No. (Kotak), Cheque ID (RBL).
   *  This is the duplicate-detection key. Empty string when the column is blank. */
  reference: string
  /** Signed: negative for withdrawals, positive for deposits. */
  amount: Paise
  /** Closing balance printed on the row, used for the integrity chain. */
  balance: Paise
  bank: BankId
  /** 1-based page the row was parsed from, for diagnostics. */
  page: number
}

/** Rows the parser saw but could not turn into a Transaction. Never dropped
 *  silently: a 3% loss makes every aggregate wrong by an unknown amount. */
export interface ParseFailure {
  page: number
  text: string
  reason: string
}

/** Where the running-balance chain holds, and where it breaks. */
export interface ChainSegment {
  fromIndex: number
  toIndex: number
  intact: boolean
  /** Set when the chain breaks: the discrepancy in paise at `toIndex`. */
  discrepancy?: Paise
}

/**
 * Coverage metadata. Attached to every tool result so the agent can never
 * report an aggregate without knowing how much of the statement it is based on.
 */
export interface Coverage {
  rowsDetected: number
  rowsParsed: number
  failures: number
  chainIntact: boolean
  chainSegments: ChainSegment[]
  pageCount: number
}

export interface ParseResult {
  transactions: Transaction[]
  failures: ParseFailure[]
  coverage: Coverage
  openingBalance: Paise | null
}

export interface Account {
  id: string
  bank: BankId
  label: string
  /** Derived from postings, never stored as an independent source of truth. */
  currentBalance: Paise
}
