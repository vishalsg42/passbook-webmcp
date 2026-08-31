/**
 * PDF text extraction.
 *
 * pdf.js gives positioned text runs, not a table. Every downstream parser works
 * on these positioned items rather than on concatenated line text, because a
 * purely textual rule splits rows on the long digit strings that appear inside
 * UPI narrations.
 */

export interface TextItem {
  /** Text content of the run. */
  str: string
  /** Horizontal position, from the pdf.js transform matrix (transform[4]). */
  x: number
  /** Vertical position, from the pdf.js transform matrix (transform[5]). */
  y: number
  /** Width of the run in the same units as x. */
  width: number
  /** 1-based page number. */
  page: number
}

export interface ExtractResult {
  items: TextItem[]
  pageCount: number
}

interface PdfTextContentItem {
  str?: string
  transform?: number[]
  width?: number
}

/** Anything shaped like a pdf.js document proxy. Kept structural so this module
 *  does not import pdfjs-dist directly, which keeps it testable in Node. */
export interface PdfDocumentLike {
  numPages: number
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>
  }>
}

export async function extractTextItems(pdf: PdfDocumentLike): Promise<ExtractResult> {
  const items: TextItem[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()

    for (const raw of content.items) {
      const item = raw as PdfTextContentItem
      const text = item.str ?? ''
      if (text.trim() === '') continue
      const transform = item.transform
      if (!transform || transform.length < 6) continue

      items.push({
        str: text,
        x: transform[4],
        y: transform[5],
        width: item.width ?? 0,
        page: pageNumber,
      })
    }
  }

  return { items, pageCount: pdf.numPages }
}

/**
 * Group items into visual lines by clustering on y within a page.
 *
 * Tolerance matters: too tight and a single line splits when runs sit a
 * fraction of a point apart, too loose and adjacent table rows merge.
 */
export function groupIntoLines(items: TextItem[], tolerance = 2): TextItem[][] {
  const byPage = new Map<number, TextItem[]>()
  for (const item of items) {
    const bucket = byPage.get(item.page)
    if (bucket) bucket.push(item)
    else byPage.set(item.page, [item])
  }

  const lines: TextItem[][] = []

  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = byPage.get(page)!
    // Descending y: PDF origin is bottom-left, so larger y is higher up.
    const sorted = [...pageItems].sort((a, b) => b.y - a.y || a.x - b.x)

    let current: TextItem[] = []
    let currentY: number | null = null

    for (const item of sorted) {
      if (currentY === null || Math.abs(item.y - currentY) <= tolerance) {
        current.push(item)
        currentY = currentY === null ? item.y : currentY
      } else {
        lines.push(current.sort((a, b) => a.x - b.x))
        current = [item]
        currentY = item.y
      }
    }
    if (current.length > 0) lines.push(current.sort((a, b) => a.x - b.x))
  }

  return lines
}

/** Flatten a line back to text, for header detection and diagnostics. */
export function lineText(line: TextItem[]): string {
  return line.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim()
}
