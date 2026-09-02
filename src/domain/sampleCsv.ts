import { seedTransactions } from './seed'

/**
 * The demo statement, as a CSV a person can download and re-import.
 *
 * The point is verifiability. Seeded data proves the anomaly engine works but
 * never touches the import path, so a reader with no Indian bank statement had
 * no way to confirm Passbook can actually read a file. This gives them one:
 * download it, drop it back in, and watch the same nine columns of evidence
 * come out of the parser rather than out of a constant.
 *
 * Generated from `seedTransactions()` rather than checked in as a fixture, so
 * it cannot drift from the demo it claims to be a copy of. A round-trip test
 * asserts the parsed result matches the seed transaction for transaction.
 *
 * CSV rather than a synthetic bank PDF, deliberately. Our PDF parser derives
 * column bands from header label geometry, so any PDF written here would be one
 * shaped until our own parser accepted it — which proves only that we can read
 * a file we designed for ourselves. A CSV is a format the reader can open and
 * check by eye, and the CSV path is the same one a real export from any bank
 * takes.
 */

/** DD/MM/YYYY, which is what Indian bank exports actually contain. The sample
 *  should look like a file from a bank, not like our internal representation. */
function bankDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Rupees with two decimals, no symbol and no grouping: what banks export. */
function rupees(paise: number): string {
  return (Math.abs(paise) / 100).toFixed(2)
}

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export const SAMPLE_CSV_FILENAME = 'passbook-sample-statement.csv'

export function sampleCsv(): string {
  // Header names are the ones Indian bank exports actually use, and they are
  // what `detectMapping` matches on, so the file maps with no manual
  // correction. Separate withdrawal and deposit columns rather than one signed
  // amount, because that is the more common and the harder shape.
  const lines = ['Date,Narration,Chq/Ref No,Withdrawal,Deposit,Closing Balance']

  for (const t of seedTransactions()) {
    lines.push(
      [
        bankDate(t.date),
        cell(t.description),
        t.reference,
        t.amount < 0 ? rupees(t.amount) : '',
        t.amount > 0 ? rupees(t.amount) : '',
        rupees(t.balance),
      ].join(','),
    )
  }

  return lines.join('\n') + '\n'
}
