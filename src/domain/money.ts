/**
 * Money handling. All amounts are integer paise.
 *
 * Three real hazards this module exists to prevent, all observed in the source
 * statements:
 *
 *  1. `parseFloat("1,245.00")` is NaN because the comma stops it. And stripping the
 *     comma then multiplying by 100 reintroduces binary float error
 *     (`12.45 * 100 === 1244.9999999999998`). So parsing is done on the string:
 *     split on the decimal point, pad the fraction, concatenate, parseInt.
 *  2. Indian grouping is lakh-based: `1,23,456.78`, not `123,456.78`. Any
 *     regex assuming three-digit groups is wrong.
 *  3. Amounts may carry a `Dr`/`Cr` suffix or a `₹` glyph, and the sign of a
 *     row is otherwise derived from *which column* is populated.
 */

export type Paise = number

const AMOUNT_PATTERN = /^-?[\d,]+(?:\.\d{1,2})?$/

/** Strip currency glyphs, whitespace, and Dr/Cr suffixes. Returns the numeric
 *  core plus whichever suffix was found. */
export function splitAmountToken(raw: string): { core: string; suffix: 'DR' | 'CR' | null } {
  let s = raw.trim()
  s = s.replace(/[₹₹]/g, '').trim()

  let suffix: 'DR' | 'CR' | null = null
  const suffixMatch = s.match(/\b(DR|CR)\.?$/i)
  if (suffixMatch) {
    suffix = suffixMatch[1].toUpperCase() as 'DR' | 'CR'
    s = s.slice(0, suffixMatch.index).trim()
  }

  // Parenthesised negatives: (1,234.00)
  if (s.startsWith('(') && s.endsWith(')')) {
    s = `-${s.slice(1, -1).trim()}`
  }

  return { core: s.replace(/\s+/g, ''), suffix }
}

/** True when the token is a well-formed money amount. Deliberately strict: a
 *  UTR or account fragment must never be mistaken for an amount. */
export function isAmountToken(raw: string): boolean {
  const { core } = splitAmountToken(raw)
  if (core === '' || core === '-') return false
  if (!AMOUNT_PATTERN.test(core)) return false
  // Require an explicit 2dp fraction: every amount column in all three
  // statement formats prints paise, while reference numbers never do.
  return /\.\d{2}$/.test(core)
}

/**
 * Parse a money token into integer paise. Throws on malformed input rather than
 * returning 0, because a silently-zeroed amount corrupts every downstream aggregate.
 */
export function parsePaise(raw: string): Paise {
  const { core, suffix } = splitAmountToken(raw)
  if (core === '' || !AMOUNT_PATTERN.test(core)) {
    throw new Error(`Not a money amount: ${JSON.stringify(raw)}`)
  }

  const negative = core.startsWith('-')
  const unsigned = negative ? core.slice(1) : core
  const [rupeesPart, fractionPart = ''] = unsigned.split('.')

  const rupees = rupeesPart.replace(/,/g, '')
  if (rupees === '' || !/^\d+$/.test(rupees)) {
    throw new Error(`Not a money amount: ${JSON.stringify(raw)}`)
  }
  const paiseDigits = (fractionPart + '00').slice(0, 2)

  const magnitude = Number.parseInt(rupees + paiseDigits, 10)
  if (!Number.isSafeInteger(magnitude)) {
    throw new Error(`Amount out of safe integer range: ${JSON.stringify(raw)}`)
  }

  const sign = negative || suffix === 'DR' ? -1 : 1
  // Avoid producing -0, which breaks equality checks downstream.
  return magnitude === 0 ? 0 : sign * magnitude
}

/** Format paise for display, with Indian lakh grouping. */
export function formatPaise(paise: Paise): string {
  const negative = paise < 0
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')

  const digits = String(rupees)
  let grouped: string
  if (digits.length <= 3) {
    grouped = digits
  } else {
    const last3 = digits.slice(-3)
    const rest = digits.slice(0, -3)
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }

  return `${negative ? '-' : ''}₹${grouped}.${fraction}`
}
