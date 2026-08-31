import { parsePaise } from './money'
import type { Transaction } from './types'

/**
 * Seeded demo statement.
 *
 * Loaded by default so anyone can open Passbook and see it work without
 * uploading anything, and so the demo never needs real financial data on
 * screen. This is real seeded data rather than a stub: the rows run through the
 * same ledger, the same balance chain, and the same anomaly engine as an
 * imported statement.
 *
 * The shape mirrors what the real statements contain: UPI person to person
 * traffic, a few merchants, standing commitments that debit an identical
 * amount, one reversed charge that must NOT be reported as a duplicate, and two
 * genuine double charges that must be.
 */

interface Row {
  date: string
  description: string
  reference: string
  /** Rupees, negative for money out. */
  amount: string
}

const ROWS: Row[] = [
  { date: '2026-01-02', description: 'UPI-SWIGGY LIMITED-SWIGGY@AXISBANK', reference: '600112233445', amount: '-412.00' },
  { date: '2026-01-03', description: 'UPI-ANJALI MEHTA-ANJALIM@OKICICI', reference: '600112233501', amount: '-2500.00' },
  { date: '2026-01-05', description: 'ACH D- WEALTHGROW SIP-SIP0004421', reference: '600112233590', amount: '-5000.00' },
  { date: '2026-01-07', description: 'UPI-BLUE TOKAI COFFEE ROASTERS-BLUETOKAI@HDFCBANK', reference: '600112233611', amount: '-680.00' },
  { date: '2026-01-09', description: 'NEFT CR-HDFC0000123-NORTHWIND SALARY', reference: 'HDFCN52200914', amount: '84000.00' },
  { date: '2026-01-11', description: 'UPI-RELIANCE RETAIL LIMITED-RELRETAIL@YBL', reference: '600112233712', amount: '-1899.00' },

  // A genuine double charge: same merchant, same amount, same day, different
  // references, and no matching credit anywhere after it.
  { date: '2026-01-14', description: 'UPI-CITYCARE HOSPITAL PVT LTD-CITYCARE@HDFCBANK', reference: '600112233801', amount: '-2450.00' },
  { date: '2026-01-14', description: 'UPI-CITYCARE HOSPITAL PVT LTD-CITYCARE@HDFCBANK', reference: '600112233802', amount: '-2450.00' },

  { date: '2026-01-16', description: 'UPI-VIKRAM SHARMA-VIKRAM99@OKAXIS', reference: '600112233890', amount: '-1200.00' },
  { date: '2026-01-18', description: 'ACH D- ACME INSURANCE PREMIUM-POL887213', reference: '600112233905', amount: '-3200.00' },

  // A reversed charge. The debit is followed by a matching credit, so this
  // pair must be excluded from duplicate findings.
  { date: '2026-01-20', description: 'UPI-ZENITH ELECTRONICS STORE-ZENITH@YBL', reference: '600112234010', amount: '-7999.00' },
  { date: '2026-01-20', description: 'UPI-ZENITH ELECTRONICS STORE-ZENITH@YBL', reference: '600112234011', amount: '-7999.00' },
  { date: '2026-01-23', description: 'UPI-ZENITH ELECTRONICS STORE-ZENITH@YBL', reference: '600112234099', amount: '7999.00' },

  { date: '2026-01-25', description: 'UPI-SWIGGY LIMITED-SWIGGY@AXISBANK', reference: '600112234140', amount: '-528.00' },
  { date: '2026-01-27', description: 'ATW-411111XXXXXX0000-A1BCDE00-MUMBAI', reference: '600112234180', amount: '-10000.00' },
  { date: '2026-01-28', description: 'ATW-411111XXXXXX0000-A1BCDE00-MUMBAI', reference: '600112234181', amount: '-10000.00' },

  { date: '2026-02-02', description: 'UPI-SWIGGY LIMITED-SWIGGY@AXISBANK', reference: '600112234260', amount: '-389.00' },
  { date: '2026-02-05', description: 'ACH D- WEALTHGROW SIP-SIP0004421', reference: '600112234310', amount: '-5000.00' },
  { date: '2026-02-08', description: 'NEFT CR-HDFC0000123-NORTHWIND SALARY', reference: 'HDFCN52240811', amount: '84000.00' },
  { date: '2026-02-11', description: 'UPI-ANJALI MEHTA-ANJALIM@OKICICI', reference: '600112234420', amount: '-2500.00' },
  { date: '2026-02-14', description: 'UPI-BLUE TOKAI COFFEE ROASTERS-BLUETOKAI@HDFCBANK', reference: '600112234488', amount: '-540.00' },
  { date: '2026-02-18', description: 'ACH D- ACME INSURANCE PREMIUM-POL887213', reference: '600112234531', amount: '-3200.00' },

  // A second genuine double charge, one day apart.
  { date: '2026-02-21', description: 'UPI-NORTHGATE FITNESS STUDIO LLP-NORTHGATE@YBL', reference: '600112234602', amount: '-3499.00' },
  { date: '2026-02-22', description: 'UPI-NORTHGATE FITNESS STUDIO LLP-NORTHGATE@YBL', reference: '600112234655', amount: '-3499.00' },

  { date: '2026-02-25', description: 'UPI-RELIANCE RETAIL LIMITED-RELRETAIL@YBL', reference: '600112234720', amount: '-2310.00' },
  { date: '2026-03-05', description: 'ACH D- WEALTHGROW SIP-SIP0004421', reference: '600112234880', amount: '-5000.00' },
  { date: '2026-03-08', description: 'NEFT CR-HDFC0000123-NORTHWIND SALARY', reference: 'HDFCN52280807', amount: '84000.00' },
  { date: '2026-03-12', description: 'UPI-VIKRAM SHARMA-VIKRAM99@OKAXIS', reference: '600112234940', amount: '-1500.00' },
  { date: '2026-03-18', description: 'ACH D- ACME INSURANCE PREMIUM-POL887213', reference: '600112235012', amount: '-3200.00' },
  { date: '2026-03-22', description: 'UPI-SWIGGY LIMITED-SWIGGY@AXISBANK', reference: '600112235090', amount: '-455.00' },
]

const OPENING_BALANCE = parsePaise('48250.00')

/** Build the seeded ledger, computing balances so the chain validates. */
export function seedTransactions(): Transaction[] {
  let balance = OPENING_BALANCE

  return ROWS.map((row, index) => {
    const amount = parsePaise(row.amount)
    balance += amount
    return {
      id: `seed-${index}`,
      accountId: 'seed-account',
      date: row.date,
      valueDate: row.date,
      description: row.description,
      reference: row.reference,
      amount,
      balance,
      bank: 'unknown' as const,
      page: Math.floor(index / 12) + 1,
    }
  })
}

export const SEED_LABEL = 'Demo statement (sample data)'
