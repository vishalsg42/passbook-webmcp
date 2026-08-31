import type { BankId } from '../../domain/types'

/**
 * Per bank statement profiles.
 *
 * All three real statements are the same shape with different labels, date
 * formats, and one or two quirks each, so they share one parser driven by these
 * profiles rather than three near duplicate implementations.
 *
 * Every label listed here was read off the real files, not guessed.
 */
export interface BankProfile {
  id: BankId
  label: string
  /** Column labels exactly as printed in the header row. */
  columns: {
    date: string
    description: string
    reference: string
    withdrawal: string
    deposit: string
    balance: string
    /** Present on HDFC and RBL, absent on Kotak. */
    valueDate?: string
    /** Kotak prints a leading row number. */
    rowNumber?: string
  }
  /** RBL splits its header across two visual lines. */
  headerSpansTwoLines?: boolean
  /** Lines matching these are structural, not transactions. */
  skip: RegExp[]
}

export const HDFC: BankProfile = {
  id: 'hdfc',
  label: 'HDFC Bank',
  columns: {
    date: 'Date',
    description: 'Narration',
    reference: 'Chq./Ref.No.',
    valueDate: 'Value Dt',
    withdrawal: 'Withdrawal Amt.',
    deposit: 'Deposit Amt.',
    balance: 'Closing Balance',
  },
  skip: [/statement of accounts?/i, /opening balance/i, /page no/i],
}

export const KOTAK: BankProfile = {
  id: 'kotak',
  label: 'Kotak Mahindra Bank',
  columns: {
    rowNumber: '#',
    date: 'Date',
    description: 'Description',
    reference: 'Chq/Ref. No.',
    withdrawal: 'Withdrawal (Dr.)',
    deposit: 'Deposit (Cr.)',
    balance: 'Balance',
  },
  skip: [/account statement/i, /opening balance/i, /savings account transactions/i],
}

export const RBL: BankProfile = {
  id: 'rbl',
  label: 'RBL Bank',
  columns: {
    date: 'Date',
    description: 'Transaction Details',
    reference: 'Cheque ID',
    valueDate: 'Value Date',
    withdrawal: 'Withdrawal Amt',
    deposit: 'Deposit Amt',
    balance: 'Balance',
  },
  headerSpansTwoLines: true,
  skip: [/accountholder name/i, /opening balance/i, /statement of account/i],
}

export const PROFILES: BankProfile[] = [HDFC, KOTAK, RBL]

/** Column keys in the order the parser reads them. */
export function columnLabels(profile: BankProfile): string[] {
  const c = profile.columns
  return [
    c.rowNumber,
    c.date,
    c.description,
    c.reference,
    c.valueDate,
    c.withdrawal,
    c.deposit,
    c.balance,
  ].filter((label): label is string => typeof label === 'string')
}
