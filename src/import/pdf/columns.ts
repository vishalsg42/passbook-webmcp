import type { TextItem } from './extract'
import { lineText } from './extract'

/**
 * Column band detection.
 *
 * Statement columns are positional, not delimited, and the two alignments
 * behave differently:
 *
 *  - numeric columns (withdrawal, deposit, balance) are RIGHT aligned, so their
 *    left edge moves with digit count while their right edge stays put.
 *  - text columns (narration, reference) are LEFT aligned and wrap.
 *
 * Deriving bands from label left edges therefore misfiles every amount. On the
 * real HDFC statement a withdrawal printed at right edge 470 was landing in the
 * Deposit band, flipping its sign, and on deposit rows the deposit and the
 * balance both collapsed into the Closing Balance band and joined into
 * "99,999.99 99,999.99", which fails to parse.
 *
 * The rule that handles both: boundaries sit at each label's RIGHT edge, and
 * runs are matched on their LEFT edge.
 */

export interface ColumnAnchor {
  key: string
  left: number
  right: number
}

export interface ColumnBand {
  key: string
  /** Inclusive lower bound, matched against a run's left edge. */
  from: number
  /** Exclusive upper bound, matched against a run's left edge. */
  to: number
}

export interface HeaderMatch {
  line: TextItem[]
  page: number
  bands: ColumnBand[]
}

export function findHeader(
  lines: TextItem[][],
  labels: string[],
  options: { joinNextLine?: boolean } = {},
): HeaderMatch | null {
  const needles = labels.map((l) => l.toLowerCase())

  for (let i = 0; i < lines.length; i++) {
    let candidate = lines[i]
    let text = lineText(candidate).toLowerCase()

    // RBL prints its header across two visual lines.
    if (options.joinNextLine && i + 1 < lines.length && !needles.every((n) => text.includes(n))) {
      const merged = [...candidate, ...lines[i + 1]].sort((a, b) => a.x - b.x)
      const mergedText = lineText(merged).toLowerCase()
      if (needles.every((n) => mergedText.includes(n))) {
        candidate = merged
        text = mergedText
      }
    }

    if (!needles.every((n) => text.includes(n))) continue

    const anchors: ColumnAnchor[] = []
    for (const label of labels) {
      const anchor = findLabelAnchor(candidate, label)
      if (!anchor) break
      anchors.push({ key: label, left: anchor.left, right: anchor.right })
    }
    if (anchors.length !== labels.length) continue

    anchors.sort((a, b) => a.right - b.right)

    // Boundaries sit at each label's RIGHT edge, and runs are matched on their
    // LEFT edge. This single rule handles both alignments on the real
    // statements: left aligned narration starts well left of its centred label,
    // while right aligned amounts start left of their own right edge but still
    // right of the previous label's right edge.
    const bands: ColumnBand[] = anchors.map((anchor, index) => {
      const prev = anchors[index - 1]
      return {
        key: anchor.key,
        from: prev ? prev.right : Number.NEGATIVE_INFINITY,
        to: index === anchors.length - 1 ? Number.POSITIVE_INFINITY : anchor.right,
      }
    })

    return { line: candidate, page: candidate[0]?.page ?? 1, bands }
  }

  return null
}

function findLabelAnchor(line: TextItem[], label: string): { left: number; right: number } | null {
  const target = label.toLowerCase()

  for (const item of line) {
    if (item.str.toLowerCase().includes(target)) {
      return { left: item.x, right: item.x + item.width }
    }
  }

  // The label may be split across adjacent runs, such as "Closing" + "Balance".
  for (let i = 0; i < line.length; i++) {
    let joined = ''
    for (let j = i; j < Math.min(i + 4, line.length); j++) {
      joined += (joined ? ' ' : '') + line[j].str
      if (joined.toLowerCase().includes(target)) {
        const last = line[j]
        return { left: line[i].x, right: last.x + last.width }
      }
    }
  }

  return null
}

/**
 * Bucket a line's runs into bands.
 *
 * Amount-shaped runs are matched on their right edge because they are right
 * aligned. Everything else is matched on its left edge, which keeps wrapped
 * narration in the narration column even when it runs long.
 */
export function assignToBands(line: TextItem[], bands: ColumnBand[]): Map<string, TextItem[]> {
  const out = new Map<string, TextItem[]>()
  for (const band of bands) out.set(band.key, [])

  for (const item of line) {
    const band = bands.find((b) => item.x >= b.from && item.x < b.to)

    if (band) {
      out.get(band.key)!.push(item)
    } else {
      // Outside every band: attribute to the nearest rather than dropping it,
      // so a run is never silently lost.
      const nearest = bands.reduce((best, b) =>
        Math.abs(item.x - b.from) < Math.abs(item.x - best.from) ? b : best,
      )
      out.get(nearest.key)!.push(item)
    }
  }

  return out
}

export function bandText(cells: Map<string, TextItem[]>, key: string): string {
  return (cells.get(key) ?? [])
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
