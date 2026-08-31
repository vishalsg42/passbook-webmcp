import type { PdfDocumentLike } from './pdf/extract'

/**
 * PDF loading with password support.
 *
 * pdf.js decrypts password protected PDFs entirely client side. It implements
 * the Standard security handler at revisions 2 to 6, which is what Indian bank
 * statements use (a user password derived from date of birth or PAN).
 * Certificate and public key handlers are not supported and fail with
 * "unknown encryption method".
 *
 * The password is passed straight into the worker and is never stored, logged,
 * or persisted.
 */

export type PasswordReason = 'needed' | 'incorrect'

export interface LoadPdfOptions {
  /** Called when the document needs a password, or when the last one was
   *  wrong. Resolve with the password, or reject to abort the load. */
  requestPassword?: (reason: PasswordReason) => Promise<string>
  onProgress?: (loaded: number, total: number) => void
}

export class PdfPasswordRequired extends Error {
  constructor() {
    super('This PDF is password protected.')
    this.name = 'PdfPasswordRequired'
  }
}

export class PdfUnsupportedEncryption extends Error {
  constructor() {
    super(
      'This PDF uses certificate based encryption, which cannot be opened in the browser. Export an unprotected copy from your bank.',
    )
    this.name = 'PdfUnsupportedEncryption'
  }
}

export class PdfNoTextLayer extends Error {
  constructor(pageCount: number) {
    super(
      `This PDF has no text layer across its ${pageCount} page(s), so it is probably a scan. Passbook reads text, not images, so download the statement as a PDF from your bank rather than scanning a printout.`,
    )
    this.name = 'PdfNoTextLayer'
  }
}

/**
 * Load a PDF from a File. Returns a pdf.js document proxy.
 *
 * Distinguishing "no text layer" from "zero transactions found" matters: the
 * first is a fixable user mistake and the second is a parser bug, and reporting
 * one as the other sends people down the wrong path.
 */
export async function loadPdf(file: File, options: LoadPdfOptions = {}): Promise<PdfDocumentLike> {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })

  task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
    if (!options.requestPassword) {
      task.destroy()
      return
    }
    // 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD
    const why: PasswordReason = reason === 2 ? 'incorrect' : 'needed'
    options
      .requestPassword(why)
      .then((password) => updatePassword(password))
      .catch(() => void task.destroy())
  }

  if (options.onProgress) {
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      options.onProgress?.(loaded, total)
    }
  }

  try {
    return (await task.promise) as unknown as PdfDocumentLike
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/password/i.test(message)) throw new PdfPasswordRequired()
    if (/unknown encryption/i.test(message)) throw new PdfUnsupportedEncryption()
    throw err
  }
}

/** Detect a scanned PDF before blaming the parser for finding nothing. */
export async function hasTextLayer(pdf: PdfDocumentLike, samplePages = 3): Promise<boolean> {
  const pages = Math.min(samplePages, pdf.numPages)
  let characters = 0

  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    for (const raw of content.items) {
      characters += ((raw as { str?: string }).str ?? '').trim().length
    }
    if (characters > 200) return true
  }

  return characters > 200
}
