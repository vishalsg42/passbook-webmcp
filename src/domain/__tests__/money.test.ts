import { describe, expect, it } from 'vitest'
import { formatPaise, isAmountToken, parsePaise } from '../money'

describe('parsePaise', () => {
  it('parses plain amounts without float error', () => {
    expect(parsePaise('12.45')).toBe(1245)
    expect(parsePaise('0.01')).toBe(1)
    expect(parsePaise('999.99')).toBe(99999)
  })

  it('handles Indian lakh grouping', () => {
    expect(parsePaise('1,23,456.78')).toBe(12345678)
    expect(parsePaise('9,99,999.99')).toBe(99999999)
    expect(parsePaise('1,245.00')).toBe(124500)
  })

  it('handles Dr/Cr suffixes and the rupee glyph', () => {
    expect(parsePaise('1,234.56 Dr.')).toBe(-123456)
    expect(parsePaise('1,234.56 Cr')).toBe(123456)
    expect(parsePaise('₹ 500.00')).toBe(50000)
  })

  it('handles parenthesised and signed negatives', () => {
    expect(parsePaise('(1,234.00)')).toBe(-123400)
    expect(parsePaise('-500.50')).toBe(-50050)
  })

  it('never produces negative zero', () => {
    expect(Object.is(parsePaise('-0.00'), 0)).toBe(true)
  })

  it('throws rather than silently zeroing', () => {
    expect(() => parsePaise('abc')).toThrow()
    expect(() => parsePaise('')).toThrow()
  })
})

describe('isAmountToken', () => {
  it('accepts real amount columns', () => {
    expect(isAmountToken('1,23,456.78')).toBe(true)
    expect(isAmountToken('500.00')).toBe(true)
    expect(isAmountToken('1,234.56 Dr.')).toBe(true)
  })

  it('rejects UTRs and account fragments that would corrupt row splitting', () => {
    expect(isAmountToken('0000123456789012')).toBe(false)   // UPI ref
    expect(isAmountToken('123456789')).toBe(false)          // MICR
    expect(isAmountToken('UPI-DR')).toBe(false)
    expect(isAmountToken('12/03/25')).toBe(false)           // a date
  })
})

describe('formatPaise', () => {
  it('formats with lakh grouping', () => {
    expect(formatPaise(12345678)).toBe('₹1,23,456.78')
    expect(formatPaise(50000)).toBe('₹500.00')
    expect(formatPaise(-123456)).toBe('-₹1,234.56')
    expect(formatPaise(1)).toBe('₹0.01')
  })

  it('round-trips', () => {
    for (const raw of ['1,23,456.78', '500.00', '0.01', '99,99,999.99']) {
      expect(formatPaise(parsePaise(raw)).replace('₹', '')).toBe(raw)
    }
  })
})
