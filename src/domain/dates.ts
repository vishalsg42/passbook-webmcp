/**
 * Date handling.
 *
 * Everything is a plain YYYY-MM-DD string. A Date object is never constructed
 * during import: `new Date('14/03/25')` then `.toISOString()` shifts an IST
 * date back a day, which silently moves transactions across month boundaries
 * and across any date-bounded aggregate.
 */

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** DD/MM/YY with a century pivot. Statements span a financial year, so a
 *  154-page HDFC statement crosses a year end and lexical sorting on the raw
 *  string is wrong. */
export function parseSlashDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const [, dd, mm, yy] = m
  const year = yy.length === 4 ? yy : Number(yy) >= 70 ? `19${yy}` : `20${yy}`
  return isValidYmd(year, mm, dd) ? `${year}-${mm}-${dd}` : null
}

/** "05 Apr 2025" as printed by Kotak. */
export function parseTextMonthDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/)
  if (!m) return null
  const [, d, mon, year] = m
  const mm = MONTHS[mon.toLowerCase()]
  if (!mm) return null
  const dd = d.padStart(2, '0')
  return isValidYmd(year, mm, dd) ? `${year}-${mm}-${dd}` : null
}

/** Try every supported statement format. */
export function parseStatementDate(raw: string): string | null {
  return parseSlashDate(raw) ?? parseTextMonthDate(raw)
}

function isValidYmd(year: string, mm: string, dd: string): boolean {
  const y = Number(year), m = Number(mm), d = Number(dd)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const daysInMonth = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= daysInMonth[m - 1]
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/** Difference in whole days between two YYYY-MM-DD strings. Uses UTC epoch
 *  arithmetic on date-only values, which has no timezone exposure. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}
