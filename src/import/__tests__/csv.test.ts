import { describe, expect, it } from 'vitest'
import { detectMapping, parseCsv, parseCsvText, previewCsv } from '../csv'

describe('parseCsvText', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsvText('Date,Narration,Amount\n01/04/2025,"QUICKBITE, BANGALORE",-412.00')
    expect(rows[1]).toEqual(['01/04/2025', 'QUICKBITE, BANGALORE', '-412.00'])
  })

  it('handles escaped quotes and CRLF', () => {
    const rows = parseCsvText('A,B\r\n1,"say ""hi"" now"\r\n')
    expect(rows[1][1]).toBe('say "hi" now')
  })

  it('strips a UTF-8 BOM so the first header is usable', () => {
    const rows = parseCsvText('﻿Date,Narration,Amount\n01/04/2025,X,-1.00')
    expect(rows[0][0]).toBe('Date')
  })
})

describe('detectMapping', () => {
  it('finds separate debit and credit columns', () => {
    const m = detectMapping(['Date', 'Narration', 'Chq/Ref No', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'])
    expect(m).toMatchObject({ date: 0, description: 1, reference: 2, withdrawal: 3, deposit: 4, balance: 5 })
  })

  it('finds a single signed amount column', () => {
    const m = detectMapping(['Transaction Date', 'Particulars', 'Amount'])
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2 })
  })

  it('returns null when required columns are absent', () => {
    expect(detectMapping(['Foo', 'Bar'])).toBeNull()
  })
})

describe('parseCsv', () => {
  const csv = [
    'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
    '01/04/2025,"QUICKBITE, BANGALORE",600112233445,412.00,,47838.00',
    '02/04/2025,SALARY CREDIT,HDFCN123,,84000.00,131838.00',
    'bad-date,BROKEN ROW,X,1.00,,1.00',
  ].join('\n')

  it('parses signs from the debit and credit columns', () => {
    const { transactions } = parseCsv(csv, previewCsv(csv).mapping!)
    expect(transactions[0].amount).toBe(-41200)
    expect(transactions[1].amount).toBe(8400000)
    expect(transactions[0].description).toBe('QUICKBITE, BANGALORE')
  })

  it('reports unreadable rows instead of dropping them silently', () => {
    const result = parseCsv(csv, previewCsv(csv).mapping!)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].reason).toBe('unreadable date')
    expect(result.coverage.rowsDetected).toBe(3)
    expect(result.coverage.rowsParsed).toBe(2)
  })

  it('validates the balance chain when the export carries balances', () => {
    expect(parseCsv(csv, previewCsv(csv).mapping!).coverage.chainIntact).toBe(true)
  })

  it('does not claim a bank the CSV never named', () => {
    const { transactions } = parseCsv(csv, previewCsv(csv).mapping!)
    expect(transactions.every((t) => t.bank === 'unknown')).toBe(true)
  })

  it('accepts a bank when the caller actually knows it', () => {
    const { transactions } = parseCsv(csv, previewCsv(csv).mapping!, 'csv-main', 'kotak')
    expect(transactions.every((t) => t.bank === 'kotak')).toBe(true)
  })

  it('does not claim an intact chain when balances were derived', () => {
    const noBalance = 'Date,Particulars,Amount\n01/04/2025,A,-100.00\n02/04/2025,B,50.00'
    const result = parseCsv(noBalance, previewCsv(noBalance).mapping!)
    expect(result.coverage.chainIntact).toBe(false)
    expect(result.transactions).toHaveLength(2)
  })
})
