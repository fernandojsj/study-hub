'use client'

import { useState, useEffect } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  TrendingUp, Target, Brain, CheckCircle2, XCircle,
  Loader2, BookOpen, ChevronRight, ChevronLeft, X,
  MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { DashboardData, SessionResults, Comment } from '@/lib/api'

const PASS_THRESHOLD = 72

// ── Helpers ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-bg-overlay px-3 py-2 shadow-xl">
      <p className="text-2xs text-zinc-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-violet">{payload[0].value?.toFixed(1)}%</p>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ── Session review drawer ─────────────────────────────────────────────────────

function ReviewComments({ comments }: { comments: Comment[] }) {
  const [open, setOpen] = useState(false)
  if (!comments?.length) return null
  return (
    <div className="border-t border-border/50">
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-2xs text-zinc-600 hover:text-zinc-400 transition-colors">
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3" />
          {comments.length} comentários da comunidade
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {comments.slice(0, 3).map((c, i) => (
            <div key={i} className="rounded-md bg-zinc-900/60 border border-border px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xs font-semibold text-zinc-400">{c.username}</span>
                {c.selected_answer && (
                  <span className="text-2xs rounded bg-violet/10 text-violet px-1.5 py-0.5">Votou: {c.selected_answer}</span>
                )}
              </div>
              <p className="text-2xs text-zinc-600 leading-relaxed">{c.text.slice(0, 200)}{c.text.length > 200 ? '…' : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SessionReview({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [data, setData]     = useState<SessionResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct'>('all')

  useEffect(() => {
    api.sessions.results(sessionId)
      .then(setData)
      .finally(() => setLoading(false))
  }, [sessionId])

  const filtered = data?.results.filter(r =>
    filter === 'all' ? true : filter === 'wrong' ? !r.is_correct : r.is_correct
  ) ?? []

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Drawer */}
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-bg border-l border-border animate-slide-in-right overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <button onClick={onClose} className="rounded-md p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="h-4 w-48 rounded bg-zinc-800 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-semibold text-white truncate">{data?.exam_name}</p>
                <p className="text-2xs text-zinc-500">
                  {data?.correct}/{data?.total} corretas · {data?.score?.toFixed(1)}%
                  {data && data.score >= PASS_THRESHOLD
                    ? <span className="text-ok ml-1">· Aprovado</span>
                    : <span className="text-fail ml-1">· Não aprovado</span>}
                </p>
              </>
            )}
          </div>

          {/* Filter tabs */}
          {!loading && (
            <div className="flex gap-1">
              {(['all', 'wrong', 'correct'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn('rounded px-2.5 py-1 text-2xs font-medium transition-colors',
                    filter === f ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300')}>
                  {f === 'all' ? `Todas (${data?.total ?? 0})` : f === 'wrong' ? `Erradas (${(data?.total ?? 0) - (data?.correct ?? 0)})` : `Corretas (${data?.correct ?? 0})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 text-violet animate-spin" />
            </div>
          )}

          {!loading && filtered.map((r, i) => (
            <div key={r.question_id} className={cn(
              'border-b border-border',
              !r.is_correct && 'bg-fail/3',
            )}>
              {/* Question header */}
              <div className="flex items-start gap-3 px-6 py-4">
                <div className={cn(
                  'shrink-0 flex h-5 w-5 items-center justify-center rounded-full mt-0.5',
                  r.is_correct ? 'bg-ok/10' : 'bg-fail/10',
                )}>
                  {r.is_correct
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
                    : <XCircle className="h-3.5 w-3.5 text-fail" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xs text-zinc-600 mb-1">Q{r.question_number} · {r.topic}</p>
                  <p className="text-sm text-zinc-200 leading-relaxed">{r.question_text}</p>
                </div>
              </div>

              {/* Options */}
              <div className="px-6 pb-3 space-y-1.5">
                {Object.entries(r.options).map(([letter, text]) => {
                  const isCorrect  = letter === r.correct_answer
                  const isUser     = letter === r.user_answer
                  const isWrong    = isUser && !isCorrect
                  return (
                    <div key={letter} className={cn(
                      'flex items-start gap-2.5 rounded-md px-3 py-2 text-xs',
                      isCorrect && 'bg-ok/8 border border-ok/20',
                      isWrong   && 'bg-fail/8 border border-fail/20',
                      !isCorrect && !isWrong && 'border border-transparent',
                    )}>
                      <span className={cn(
                        'shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-2xs font-bold',
                        isCorrect ? 'bg-ok text-white' : isWrong ? 'bg-fail text-white' : 'bg-zinc-800 text-zinc-500',
                      )}>
                        {letter}
                      </span>
                      <span className={cn(
                        'leading-relaxed',
                        isCorrect ? 'text-ok' : isWrong ? 'text-fail' : 'text-zinc-500',
                      )}>
                        {text.startsWith('[Imagem') ? (
                          <a href={text.replace('[Imagem — ver no ExamTopics] ', '')} target="_blank" rel="noopener noreferrer"
                            className="text-violet underline underline-offset-2">Ver imagem ↗</a>
                        ) : text}
                        {isCorrect && !isUser && <span className="ml-2 text-2xs opacity-60">(resposta correta)</span>}
                        {isUser && !isCorrect && <span className="ml-2 text-2xs opacity-60">(sua resposta)</span>}
                      </span>
                    </div>
                  )
                })}
              </div>

              <ReviewComments comments={r.comments} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
      <div className="rounded-full bg-violet/10 p-4">
        <BookOpen className="h-8 w-8 text-violet" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Nenhuma sessão ainda</p>
        <p className="text-xs text-zinc-500 mt-1">Complete um simulado para ver suas métricas aqui.</p>
      </div>
      <Link href="/study" className="btn-primary mt-2">
        <Brain className="h-4 w-4" />Começar agora
      </Link>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData]           = useState<DashboardData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [reviewId, setReviewId]   = useState<number | null>(null)

  useEffect(() => {
    api.dashboard.get()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 text-violet animate-spin" />
      </div>
    )
  }

  if (!data || data.total_sessions === 0) {
    return (
      <div className="min-h-full p-8 animate-fade-in">
        <div className="flex items-end justify-between mb-8">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
          <Link href="/study" className="btn-primary"><Brain className="h-4 w-4" />Estudar agora</Link>
        </div>
        <EmptyState />
      </div>
    )
  }

  const { total_sessions, average_score, best_score, topic_performance, history } = data
  const passCount = history.filter(s => s.score >= PASS_THRESHOLD).length

  const radarData = Object.entries(topic_performance).slice(0, 10).map(([topic, v]) => ({
    topic: topic.length > 16 ? topic.slice(0, 14) + '…' : topic,
    score: Math.round(v.percentage),
  }))

  const historyChart = history.map(s => ({
    label: formatDate(s.started_at),
    score: Math.round(s.score),
  }))

  const STATS = [
    { label: 'Média geral',     value: `${average_score.toFixed(1)}%`, sub: `${total_sessions} sessão${total_sessions !== 1 ? 'ões' : ''}`, icon: TrendingUp,   color: 'text-violet' },
    { label: 'Melhor resultado',value: `${best_score.toFixed(1)}%`,    sub: best_score >= PASS_THRESHOLD ? 'Acima da meta' : `Meta: ${PASS_THRESHOLD}%`, icon: Target, color: best_score >= PASS_THRESHOLD ? 'text-ok' : 'text-warn' },
    { label: 'Sessões aprovadas',value: `${passCount}/${total_sessions}`, sub: `Meta: ${PASS_THRESHOLD}%`, icon: CheckCircle2, color: passCount > 0 ? 'text-ok' : 'text-zinc-500' },
    { label: 'Tópicos avaliados',value: String(Object.keys(topic_performance).length), sub: 'áreas cobertas', icon: Brain, color: 'text-blue-400' },
  ]

  return (
    <div className="min-h-full p-8 space-y-8 animate-fade-in">
      {reviewId && <SessionReview sessionId={reviewId} onClose={() => setReviewId(null)} />}

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-600 mb-1">Progresso geral</p>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard</h1>
        </div>
        <Link href="/study" className="btn-primary"><Brain className="h-4 w-4" />Estudar agora</Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="stat-card space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-zinc-500">{label}</p>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
            <p className="text-xs text-zinc-600">{sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        {radarData.length > 0 && (
          <div className="xl:col-span-2 rounded-lg border border-border bg-bg-raised p-6 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">Domínios</p>
              <p className="text-sm font-semibold text-white mt-0.5">Desempenho por tópico</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} outerRadius="70%">
                <PolarGrid stroke="#27272a" />
                <PolarAngleAxis dataKey="topic" tick={{ fill: '#71717a', fontSize: 10 }} />
                <Radar dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
              {radarData.map(d => (
                <div key={d.topic} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-zinc-500 truncate">{d.topic}</span>
                  <span className={cn('text-xs font-semibold tabular-nums ml-2',
                    d.score >= PASS_THRESHOLD ? 'text-ok' : d.score >= 60 ? 'text-warn' : 'text-fail')}>
                    {d.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={cn('rounded-lg border border-border bg-bg-raised p-6 space-y-4',
          radarData.length > 0 ? 'xl:col-span-3' : 'xl:col-span-5')}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">Histórico</p>
              <p className="text-sm font-semibold text-white mt-0.5">Evolução da pontuação</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-violet inline-block" />Score
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-4 border-t border-dashed border-ok inline-block" />Meta {PASS_THRESHOLD}%
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={historyChart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#1c1c1f" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1 }} />
              <ReferenceLine y={PASS_THRESHOLD} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} />
              <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2}
                dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#8b5cf6', strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 rounded-lg bg-bg-overlay border border-border px-4 py-3">
            <div>
              <p className="text-xs text-zinc-500">Taxa de aprovação</p>
              <p className="text-lg font-bold text-white">{passCount}/{total_sessions}
                <span className="text-xs font-normal text-zinc-500 ml-1">sessões</span>
              </p>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="flex-1">
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', passCount > 0 ? 'bg-ok' : 'bg-zinc-700')}
                  style={{ width: `${total_sessions > 0 ? (passCount / total_sessions) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-zinc-600 mt-1.5">
                {total_sessions > 0 ? Math.round((passCount / total_sessions) * 100) : 0}% acima de {PASS_THRESHOLD}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions table — clicável */}
      <div className="rounded-lg border border-border bg-bg-raised overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Sessões recentes</p>
          <span className="text-2xs text-zinc-600 tabular-nums">{total_sessions} total · clique para revisar</span>
        </div>
        <div className="divide-y divide-border">
          {history.slice(0, 10).map(session => {
            const passed = session.score >= PASS_THRESHOLD
            return (
              <button
                key={session.id}
                onClick={() => setReviewId(session.id)}
                className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-zinc-800/30 transition-colors text-left"
              >
                <div className="shrink-0">
                  {passed
                    ? <CheckCircle2 className="h-4 w-4 text-ok" />
                    : <XCircle className="h-4 w-4 text-fail" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200">
                    Sessão #{session.id}
                    <span className="text-zinc-600 ml-2">· {session.total_questions} questões</span>
                  </p>
                  <p className="text-2xs text-zinc-600 mt-0.5">{formatDate(session.started_at)}</p>
                </div>
                <p className={cn('text-sm font-semibold tabular-nums shrink-0',
                  passed ? 'text-ok' : session.score >= 60 ? 'text-warn' : 'text-fail')}>
                  {session.score.toFixed(1)}%
                </p>
                <ChevronRight className="h-3.5 w-3.5 text-zinc-700 shrink-0" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
