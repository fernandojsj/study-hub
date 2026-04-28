'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Zap, RefreshCw, CheckCircle2, XCircle, X,
  AlertTriangle, Info, ArrowRight, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScrapeStatus {
  status: 'not_started' | 'starting' | 'running' | 'completed' | 'failed'
  progress: number
  total: number
  saved: number
  new?: number
  skipped?: number
  total_db?: number
  errors: number
  last_url: string
  auth_required?: boolean
  error?: string
}

interface ScrapePanelProps {
  examId: number
  defaultUrl?: string
  onComplete?: (saved: number) => void
  onClose?: () => void
}

// ── URL helpers ───────────────────────────────────────────────────────────────

function detectUrlType(url: string): 'exam_index' | 'discussion' | 'unknown' {
  if (/examtopics\.com\/exams\/[^/]+\/[^/]+/.test(url)) return 'exam_index'
  if (/examtopics\.com\/discussions\//.test(url))        return 'discussion'
  return 'unknown'
}

function normalizeUrlLocally(url: string): string | null {
  // With topic suffix: /discussions/{vendor}/view/{id}-exam-{slug}-topic-{n}-question-{n}/
  const m1 = url.match(/examtopics\.com\/discussions\/([^/]+)\/view\/\d+-exam-(.*?)-topic-\d+/)
  if (m1) return `https://www.examtopics.com/exams/${m1[1]}/${m1[2]}/`
  // Without topic suffix: /discussions/{vendor}/view/{id}-exam-{slug}/
  const m2 = url.match(/examtopics\.com\/discussions\/([^/]+)\/view\/\d+-exam-([^/]+?)\/?$/)
  if (m2) return `https://www.examtopics.com/exams/${m2[1]}/${m2[2].replace(/\/$/, '')}/`
  return null
}

// ── Preset exams ──────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'GCP · Professional Cloud Architect',        url: 'https://www.examtopics.com/exams/google/professional-cloud-architect/',  total: 336 },
  { label: 'GCP · Associate Cloud Engineer',            url: 'https://www.examtopics.com/exams/google/associate-cloud-engineer/',      total: 324 },
  { label: 'GCP · Professional Data Engineer',          url: 'https://www.examtopics.com/exams/google/professional-data-engineer/',    total: 304 },
  { label: 'AWS · Solutions Architect Associate',       url: 'https://www.examtopics.com/exams/amazon/aws-certified-solutions-architect-associate/', total: 591 },
  { label: 'AWS · Developer Associate',                 url: 'https://www.examtopics.com/exams/amazon/aws-certified-developer-associate/', total: 400 },
  { label: 'Azure · AZ-900 Fundamentals',               url: 'https://www.examtopics.com/exams/microsoft/az-900/',                    total: 380 },
  { label: 'Azure · AZ-104 Administrator',              url: 'https://www.examtopics.com/exams/microsoft/az-104/',                    total: 521 },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ScrapePanel({ examId, defaultUrl = '', onComplete, onClose }: ScrapePanelProps) {
  const [examUrl, setExamUrl]         = useState(defaultUrl)
  const [totalQuestions, setTotal]    = useState(100)
  const [status, setStatus]           = useState<ScrapeStatus | null>(null)
  const [polling, setPolling]         = useState(false)
  const [showPresets, setShowPresets] = useState(!defaultUrl)

  // URL validation state
  const [urlType, setUrlType]           = useState<'exam_index' | 'discussion' | 'unknown' | ''>('')
  const [suggestedUrl, setSuggestedUrl] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  // Detect URL type on change
  useEffect(() => {
    const url = examUrl.trim()
    if (!url) { setUrlType(''); setSuggestedUrl(null); return }

    const type = detectUrlType(url)
    setUrlType(type)

    if (type === 'discussion') {
      setSuggestedUrl(normalizeUrlLocally(url))
    } else {
      setSuggestedUrl(null)
    }
  }, [examUrl])

  const applyUrl = (url: string, total?: number) => {
    setExamUrl(url)
    if (total) setTotal(total)
    setShowPresets(false)
  }

  const fixUrl = () => {
    if (suggestedUrl) {
      setExamUrl(suggestedUrl)
      setSuggestedUrl(null)
    }
  }

  const startScrape = async () => {
    const url = examUrl.trim()
    if (!url) return

    setStatus({ status: 'starting', progress: 0, total: totalQuestions, saved: 0, errors: 0, last_url: '' })

    const res = await fetch('/api/scrape-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: examId, exam_url: url, total_questions: totalQuestions }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setStatus(s => ({ ...s!, status: 'failed', error: err.detail ?? 'Falha ao iniciar' }))
      return
    }

    setPolling(true)
    intervalRef.current = setInterval(async () => {
      const data: ScrapeStatus = await fetch(`/api/scrape/status/${examId}`).then(r => r.json())
      setStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(intervalRef.current!)
        setPolling(false)
        if (data.status === 'completed') onComplete?.(data.saved)
      }
    }, 2500)
  }

  const pct     = status && status.total > 0 ? Math.min((status.progress / status.total) * 100, 100) : 0
  const running = polling || status?.status === 'running' || status?.status === 'starting'
  const done    = status?.status === 'completed'
  const failed  = status?.status === 'failed'
  const canStart = examUrl.trim() && urlType !== 'unknown' && !running

  return (
    <div className="rounded-lg border border-violet/25 bg-violet-muted overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-violet/15">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-violet" />
          <p className="text-xs font-semibold text-white">Importar questões do ExamTopics</p>
        </div>
        {onClose && !running && (
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* How it works badge */}
        <div className="flex items-start gap-2 rounded-md bg-zinc-900/60 border border-border px-3 py-2.5">
          <Info className="h-3.5 w-3.5 text-violet shrink-0 mt-0.5" />
          <p className="text-2xs text-zinc-500 leading-relaxed">
            Sem login necessário. Usa a API interna do ExamTopics via AJAX — questões e comentários
            da comunidade são importados automaticamente.
          </p>
        </div>

        {/* URL input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-2xs font-medium uppercase tracking-widest text-zinc-500">
              URL do exame
            </label>
            <button
              onClick={() => setShowPresets(v => !v)}
              className="text-2xs text-violet hover:text-violet-dim transition-colors"
            >
              {showPresets ? 'Fechar' : 'Exames conhecidos ↓'}
            </button>
          </div>

          {/* Presets dropdown */}
          {showPresets && (
            <div className="rounded-md border border-border bg-bg divide-y divide-border overflow-hidden animate-fade-in">
              {PRESETS.map(p => (
                <button
                  key={p.url}
                  onClick={() => applyUrl(p.url, p.total)}
                  className="w-full text-left px-3 py-2.5 hover:bg-zinc-800/80 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-300 group-hover:text-white transition-colors">{p.label}</p>
                    <span className="text-2xs text-zinc-600 shrink-0">{p.total} Q</span>
                  </div>
                  <p className="text-2xs text-zinc-700 font-mono mt-0.5 truncate">{p.url}</p>
                </button>
              ))}
            </div>
          )}

          <input
            value={examUrl}
            onChange={e => setExamUrl(e.target.value)}
            disabled={running}
            placeholder="https://www.examtopics.com/exams/google/professional-cloud-architect/"
            className={cn(
              'w-full rounded-md border bg-bg px-3 py-2 text-xs font-mono transition-colors',
              'placeholder:text-zinc-700 text-zinc-200',
              'focus:outline-none focus:ring-1 disabled:opacity-50',
              urlType === 'exam_index' && 'border-ok/50 focus:border-ok focus:ring-ok/20',
              urlType === 'discussion' && 'border-warn/50 focus:border-warn focus:ring-warn/20',
              urlType === 'unknown'    && examUrl && 'border-fail/50 focus:border-fail focus:ring-fail/20',
              (!urlType || !examUrl)  && 'border-border focus:border-violet focus:ring-violet/20',
            )}
          />

          {/* URL feedback messages */}
          {urlType === 'exam_index' && examUrl && (
            <div className="flex items-center gap-1.5 text-2xs text-ok">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              URL do índice do exame detectada — formato correto.
            </div>
          )}

          {urlType === 'discussion' && (
            <div className="rounded-md border border-warn/25 bg-warn-muted px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-2xs text-warn font-medium">URL de discussão detectada</p>
                  <p className="text-2xs text-zinc-500 leading-relaxed">
                    O scraper precisa da URL do <strong className="text-zinc-400">índice do exame</strong>, não de uma questão específica.
                    {suggestedUrl && ' Clique em corrigir para usar a URL certa:'}
                  </p>
                  {suggestedUrl && (
                    <p className="font-mono text-2xs text-zinc-400 break-all">{suggestedUrl}</p>
                  )}
                </div>
              </div>
              {suggestedUrl && (
                <button
                  onClick={fixUrl}
                  className="flex items-center gap-1.5 rounded px-2.5 py-1 text-2xs font-medium
                             bg-warn/15 text-warn hover:bg-warn/25 transition-colors border border-warn/20"
                >
                  <ArrowRight className="h-3 w-3" />
                  Usar URL correta
                </button>
              )}
            </div>
          )}

          {urlType === 'unknown' && examUrl && (
            <div className="flex items-center gap-1.5 text-2xs text-fail">
              <XCircle className="h-3 w-3 shrink-0" />
              URL não reconhecida. Use a URL da página do exame no ExamTopics.
            </div>
          )}

          {/* Format hint */}
          {!examUrl && (
            <p className="text-2xs text-zinc-700 font-mono">
              Formato: examtopics.com/exams/<span className="text-zinc-600">{'{vendor}'}</span>/<span className="text-zinc-600">{'{exam-slug}'}</span>/
            </p>
          )}
        </div>

        {/* Total + quick picks + start */}
        <div className="space-y-2">
          <label className="text-2xs font-medium uppercase tracking-widest text-zinc-500">
            Total de questões
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number" min={1} max={1000}
              value={totalQuestions}
              onChange={e => setTotal(Math.max(1, Number(e.target.value)))}
              disabled={running}
              className="w-20 rounded-md border border-border bg-bg px-3 py-2 text-xs text-zinc-200
                         focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30
                         disabled:opacity-50 transition-colors"
            />
            <div className="flex gap-1 flex-wrap">
              {[65, 100, 200, 324, 336].map(n => (
                <button
                  key={n}
                  onClick={() => setTotal(n)}
                  disabled={running}
                  className={cn(
                    'rounded px-2 py-1.5 text-2xs font-medium transition-colors disabled:opacity-40',
                    totalQuestions === n
                      ? 'bg-violet text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={startScrape}
          disabled={!canStart}
          className={cn(
            'w-full flex items-center justify-center gap-2 rounded-md py-2.5 text-xs font-semibold transition-all',
            canStart
              ? 'bg-violet text-white hover:bg-violet-dim active:scale-[0.98]'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
          )}
        >
          {running
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando questões…</>
            : done
              ? <><RefreshCw className="h-3.5 w-3.5" /> Reimportar</>
              : <><Zap className="h-3.5 w-3.5" /> Importar {totalQuestions} questões</>
          }
        </button>

        {/* Progress */}
        {status && status.status !== 'not_started' && (
          <div className="space-y-2">
            {/* Bar */}
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  done   ? 'bg-ok' :
                  failed ? 'bg-fail' : 'bg-violet',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Status row */}
            <div className="flex items-center justify-between text-2xs">
              <span className={cn(
                'flex items-center gap-1.5 font-medium',
                done   ? 'text-ok' :
                failed ? 'text-fail' :
                         'text-zinc-400',
              )}>
                {status.status === 'starting' && (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Conectando ao ExamTopics…</>
                )}
                {status.status === 'running' && (
                  <>Questão {status.progress} de {status.total}</>
                )}
                {done && (
                  <><CheckCircle2 className="h-3 w-3" />
                    {status.new != null
                      ? <>{status.new} novas · {status.skipped} já existiam · {status.total_db} total</>
                      : <>{status.saved} questões importadas com sucesso</>
                    }
                  </>
                )}
                {failed && (
                  <><XCircle className="h-3 w-3" /> {status.error ?? 'Erro desconhecido'}</>
                )}
              </span>
              {running && (
                <span className="text-zinc-600 tabular-nums font-mono">{pct.toFixed(0)}%</span>
              )}
              {done && status.errors > 0 && (
                <span className="text-warn">{status.errors} skipped</span>
              )}
            </div>

            {/* Last Q being fetched */}
            {running && status.last_url && (
              <p className="text-2xs text-zinc-700 truncate font-mono">↳ {status.last_url}</p>
            )}

            {/* Time estimate */}
            {running && status.total > 0 && status.progress > 0 && (
              <p className="text-2xs text-zinc-700">
                Estimativa: ~{Math.ceil(((status.total - status.progress) * 3.5) / 60)} min restantes
                · delays aleatórios para não sobrecarregar o servidor
              </p>
            )}

            {/* Auth required */}
            {status.auth_required && (
              <div className="flex items-start gap-2 rounded-md bg-warn-muted border border-warn/20 px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
                <p className="text-2xs text-warn leading-relaxed">
                  Página bloqueada pelo ExamTopics. O modo AJAX contorna isso para a maioria das questões.
                  Se muitas questões falharem, tente novamente em alguns minutos.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
