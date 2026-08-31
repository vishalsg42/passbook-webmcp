import { useCallback, useRef, useState } from 'react'
import { AlertCircle, Loader2, Lock, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { recomputeFindings } from '@/tools'
import { store } from '@/domain/store'
import { extractTextItems } from '@/import/pdf/extract'
import { detectProfile, parseStatement } from '@/import/pdf/parseStatement'
import { hasTextLayer, loadPdf, PdfNoTextLayer, type PasswordReason } from '@/import/loadPdf'
import { parseCsv, previewCsv } from '@/import/csv'
import type { ParseResult } from '@/domain/types'

type Phase = 'idle' | 'reading' | 'password' | 'parsing' | 'error'

interface PasswordRequest {
  reason: PasswordReason
  resolve: (password: string) => void
  reject: () => void
}

/**
 * Statement import.
 *
 * Password handling is a first class path rather than an afterthought: most
 * Indian bank statements arrive encrypted with a password derived from a date
 * of birth or PAN. The password goes straight to the pdf.js worker and is never
 * stored, logged, or persisted.
 */
export function ImportPanel() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [request, setRequest] = useState<PasswordRequest | null>(null)
  const [password, setPassword] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const commit = useCallback((file: File, result: ParseResult, sourceLabel: string) => {
    store.update({
      transactions: result.transactions,
      findings: recomputeFindings(result.transactions),
      coverage: result.coverage,
      statementLabel: `${file.name} (${sourceLabel})`,
    })
    store.log({
      actor: 'human',
      action: `Imported ${file.name} as ${sourceLabel}`,
      outcome: 'ok',
      detail: `${result.coverage.rowsParsed} of ${result.coverage.rowsDetected} rows${
        result.failures.length > 0 ? `, ${result.failures.length} unreadable` : ''
      }`,
    })
    setPhase('idle')
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setPhase('reading')

    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'

    try {
      if (isCsv) {
        setPhase('parsing')
        const text = await file.text()
        const preview = previewCsv(text)
        if (!preview.mapping) {
          throw new Error(
            `${preview.problem ?? 'This CSV could not be read.'} Columns found: ${
              preview.headers.join(', ') || 'none'
            }.`,
          )
        }
        const result = parseCsv(text, preview.mapping)
        if (result.transactions.length === 0) {
          throw new Error('No rows in that CSV could be read as transactions.')
        }
        commit(file, result, 'CSV')
        return
      }

      const pdf = await loadPdf(file, {
        requestPassword: (reason) =>
          new Promise<string>((resolve, reject) => {
            setPhase('password')
            setPassword('')
            setRequest({ reason, resolve, reject })
          }),
      })

      setRequest(null)
      setPhase('parsing')

      if (!(await hasTextLayer(pdf))) throw new PdfNoTextLayer(pdf.numPages)

      const { items } = await extractTextItems(pdf)

      const profile = detectProfile(items)
      if (!profile) {
        throw new Error(
          'This statement layout was not recognised. Passbook reads HDFC, Kotak Mahindra, and RBL statements.',
        )
      }

      const result = parseStatement(items, profile)
      if (result.transactions.length === 0) {
        throw new Error(
          `The ${profile.label} layout was recognised but no transactions could be read from it.`,
        )
      }

      commit(file, result, profile.label)
    } catch (err) {
      setRequest(null)
      setPhase('error')
      setError(err instanceof Error ? err.message : String(err))
      store.log({
        actor: 'human',
        action: `Import failed: ${file.name}`,
        outcome: 'error',
        detail: err instanceof Error ? err.message : undefined,
      })
    }
  }, [commit])

  const submitPassword = () => {
    if (!request || password === '') return
    const { resolve } = request
    setRequest(null)
    setPhase('parsing')
    resolve(password)
    setPassword('')
  }

  const busy = phase === 'reading' || phase === 'parsing'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a statement</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div
            role="alert"
            className="mb-4 flex gap-2.5 rounded-[10px] border border-[#f5cdc8] bg-[#fdecea] px-4 py-3 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <strong className="block font-semibold">Could not read that file</strong>
              {error}
            </div>
          </div>
        )}

        {request ? (
          <div>
            <div className="mb-4 flex gap-2.5 rounded-[10px] border border-[#c3d5f5] bg-[#e8effb] px-4 py-3 text-sm text-[#1e40af]">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <strong className="block font-semibold">
                  {request.reason === 'incorrect'
                    ? 'That password did not work'
                    : 'This statement is password protected'}
                </strong>
                Banks usually set this to your date of birth or PAN. It is sent straight to the PDF
                reader in this tab, and is never stored or uploaded.
              </div>
            </div>

            <label htmlFor="pdf-password" className="mb-2 block text-[13px] font-medium">
              Statement password
            </label>
            <Input
              id="pdf-password"
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
            />
            <div className="mt-3 flex gap-2">
              <Button onClick={submitPassword} disabled={password === ''}>
                Unlock statement
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  request.reject()
                  setRequest(null)
                  setPhase('idle')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-[10px] border-[1.5px] border-dashed px-6 py-8 text-center transition-colors duration-200 ${
              dragging ? 'border-navy bg-muted-bg' : 'border-line bg-[#fcfdff]'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) void handleFile(file)
            }}
          >
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-[10px] bg-muted-bg text-navy">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            </div>
            <p className="mb-4 text-[15px] text-muted">
              {busy
                ? phase === 'reading'
                  ? 'Opening the statement'
                  : 'Reading transactions'
                : 'Drop your bank statement here, or choose a file. PDF or CSV.'}
            </p>
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>
              Choose statement
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.csv,application/pdf,text/csv"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ''
              }}
            />
            <p className="mt-4 text-[13px] text-muted">
              HDFC, Kotak Mahindra, and RBL PDFs, or a CSV export from any bank. Everything is
              read inside this browser
              tab, and your statement is never uploaded.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
