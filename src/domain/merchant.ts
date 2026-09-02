/**
 * Merchant extraction from bank narration.
 *
 * Narration shapes these formats use. The examples are invented, but the
 * structure matches what real statements print:
 *   UPI-PRIYA RAMESH K-PRIYARK123@IB
 *   UPI-DR CITYCARE HOSPITA-CITYCAREHOSPITAL
 *   NEFT CR-ICIC0000001-PAYROLLCO
 *   ACH D- TP ACH ESIGNCORP-1234567890
 *   CLG TO NORTHWIND SYSTEMS IDFC FIRST 12/NCRCTS_12345678
 *
 * The counterparty is the first human readable segment after the rail prefix.
 * Everything after it is routing detail: VPAs, IFSC codes, UTRs, and reference
 * numbers, none of which identify who was paid.
 */

/** Rail prefixes stripped before looking for the counterparty. */
const RAIL_PREFIXES = [
  /^UPI-DR\s*/i,
  /^UPI-CR\s*/i,
  /^UPI[-/]\s*/i,
  /^NEFT\s+(CR|DR)-\s*/i,
  /^NEFT\s*/i,
  /^IMPS-\s*/i,
  /^RTGS-\s*/i,
  /^ACH\s+[DC]-?\s*/i,
  /^CLG\s+TO\s+/i,
  /^POS\s+\d+\s*/i,
  /^ATW-\s*/i,
  /^MMT\/IMPS\/\d+\/?/i,
]

/** Tokens that are routing detail rather than a counterparty name. */
const NOISE = /^(?:[A-Z]{4}\d{6,}|\d{6,}|[A-Z0-9]*@[A-Z0-9.]+|IB|YBL|OKICICI|OKAXIS|OKHDFCBANK|PAYTM|IBL|SBIN|HDFC|ICIC|UTIB|KKBK|RATN)$/i

export function extractMerchant(description: string): string {
  let text = description.trim()

  for (const prefix of RAIL_PREFIXES) {
    const stripped = text.replace(prefix, '')
    if (stripped !== text) {
      text = stripped
      break
    }
  }

  // The counterparty is the first hyphen or slash delimited segment.
  const segment = text.split(/[-/]/)[0] ?? text

  const words = segment
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9@.&]/g, ''))
    .filter((w) => w.length > 0 && !NOISE.test(w))

  const name = words.join(' ').trim()
  return name === '' ? text.slice(0, 40).trim() : name
}

/**
 * A comparison key for "is this the same counterparty".
 *
 * Deliberately lossy: case folded, punctuation stripped, and truncated to the
 * first three meaningful words, so "QUICKBITE LIMITED" and "QUICKBITE LTD BANGALORE"
 * collapse together while remaining specific enough not to merge unrelated
 * payees.
 */
export function merchantKey(description: string): string {
  const merchant = extractMerchant(description)
  const words = merchant
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)

  return words.join(' ')
}
