'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight, ChevronLeft, StickyNote, CheckCircle2,
  XCircle, MessageSquare, ChevronDown, ChevronUp,
  BookOpen, ArrowRight, RotateCcw, BarChart2,
  Loader2, AlertCircle, Award, Shuffle, ListOrdered,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { NotesPanel } from '@/components/study/notes-panel'
import { api } from '@/lib/api'
import type { Exam, Question, Comment, SessionPayload } from '@/lib/api'

// ── Setup screen ──────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onStart: (exam: Exam, session: SessionPayload) => void
}

function SetupScreen({ onStart }: SetupScreenProps) {
  const [exams, setExams]               = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [questionCount, setCount]       = useState(65)
  const [mode, setMode]                 = useState<'random' | 'sequential'>('random')
  const [startFrom, setStartFrom]       = useState(1)
  const [loading, setLoading]           = useState(true)
  const [starting, setStarting]         = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    api.exams.list()
      .then(data => {
        const withQ = data.filter(e => e.total_questions > 0)
        setExams(withQ)
        if (withQ.length > 0) setSelectedExam(withQ[0])
      })
      .catch(() => setError('Backend offline — inicie o servidor FastAPI.'))
      .finally(() => setLoading(false))
  }, [])

  // When sequential mode and startFrom changes, clamp count to remaining questions
  const maxCount = selectedExam
    ? mode === 'sequential'
      ? Math.max(1, selectedExam.total_questions - startFrom + 1)
      : selectedExam.total_questions
    : 999

  const start = async () => {
    if (!selectedExam) return
    setStarting(true)
    setError('')
    try {
      const clampedCount = Math.min(questionCount, maxCount)
      const session = await api.sessions.create(
        selectedExam.id,
        clampedCount,
        mode === 'sequential' ? startFrom : undefined,
      )
      if ((session as any).detail) {
        setError((session as any).detail)
        setStarting(false)
        return
      }
      onStart(selectedExam, session)
    } catch {
      setError('Falha ao criar sessão.')
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 text-violet animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-md space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-violet" />
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">Modo Estudo</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Configurar sessão</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Responda com feedback imediato e anotações por questão.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-fail/20 bg-fail-muted px-4 py-3">
            <AlertCircle className="h-4 w-4 text-fail shrink-0 mt-0.5" />
            <p className="text-sm text-fail">{error}</p>
          </div>
        )}

        {exams.length === 0 && !error && (
          <div className="rounded-lg border border-border bg-bg-raised px-5 py-6 text-center space-y-3">
            <Award className="h-8 w-8 text-zinc-700 mx-auto" />
            <p className="text-sm text-zinc-400">Nenhuma certificação com questões disponível.</p>
            <Link href="/certifications" className="btn-primary justify-center inline-flex">
              <Award className="h-4 w-4" />
              Importar questões
            </Link>
          </div>
        )}

        {exams.length > 0 && (
          <>
            {/* Exam picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Certificação
              </label>
              <div className="grid gap-2">
                {exams.map(exam => (
                  <button
                    key={exam.id}
                    onClick={() => {
                      setSelectedExam(exam)
                      setCount(Math.min(questionCount, exam.total_questions))
                      setStartFrom(1)
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all',
                      selectedExam?.id === exam.id
                        ? 'border-violet bg-violet-muted shadow-glow-violet'
                        : 'border-border bg-bg-raised hover:border-border-strong',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{exam.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{exam.total_questions} questões disponíveis</p>
                    </div>
                    {selectedExam?.id === exam.id && (
                      <CheckCircle2 className="h-4 w-4 text-violet shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode toggle */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Modo de seleção
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode('random')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium transition-all',
                    mode === 'random'
                      ? 'border-violet bg-violet-muted text-white'
                      : 'border-border bg-bg-raised text-zinc-400 hover:border-border-strong hover:text-zinc-200',
                  )}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Aleatório
                </button>
                <button
                  onClick={() => setMode('sequential')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium transition-all',
                    mode === 'sequential'
                      ? 'border-violet bg-violet-muted text-white'
                      : 'border-border bg-bg-raised text-zinc-400 hover:border-border-strong hover:text-zinc-200',
                  )}
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  Sequencial
                </button>
              </div>

              {/* Start from — only shown in sequential mode */}
              {mode === 'sequential' && (
                <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-raised px-4 py-3 animate-fade-in">
                  <label className="text-xs text-zinc-500 shrink-0">Começar da questão</label>
                  <input
                    type="number"
                    min={1}
                    max={selectedExam?.total_questions ?? 999}
                    value={startFrom}
                    onChange={e => {
                      const v = Math.max(1, Math.min(
                        Number(e.target.value),
                        selectedExam?.total_questions ?? 999,
                      ))
                      setStartFrom(v)
                      setCount(Math.min(questionCount, Math.max(1, (selectedExam?.total_questions ?? 999) - v + 1)))
                    }}
                    className="w-20 rounded-md border border-border bg-bg px-3 py-1.5 text-sm
                               text-zinc-200 text-center font-semibold
                               focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30"
                  />
                  {selectedExam && (
                    <span className="text-2xs text-zinc-600">
                      até Q{selectedExam.total_questions} ({Math.max(0, selectedExam.total_questions - startFrom + 1)} disponíveis)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Question count */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                Quantidade de questões
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={maxCount}
                  value={questionCount}
                  onChange={e => setCount(Math.max(1, Math.min(Number(e.target.value), maxCount)))}
                  className="w-24 rounded-md border border-border bg-bg px-3 py-2 text-sm text-zinc-200
                             focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30"
                />
                <div className="flex gap-1.5 flex-wrap">
                  {[10, 30, 65].map(n => (
                    <button
                      key={n}
                      disabled={n > maxCount}
                      onClick={() => setCount(n)}
                      className={cn(
                        'rounded px-2.5 py-1.5 text-xs font-medium transition-all disabled:opacity-30',
                        questionCount === n
                          ? 'bg-violet text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  {selectedExam && (
                    <button
                      onClick={() => setCount(maxCount)}
                      className={cn(
                        'rounded px-2.5 py-1.5 text-xs font-medium transition-all',
                        questionCount === maxCount
                          ? 'bg-violet text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
                      )}
                    >
                      {mode === 'sequential' ? `Restantes (${maxCount})` : `Todas (${maxCount})`}
                    </button>
                  )}
                </div>
              </div>
              {mode === 'sequential' && selectedExam && (
                <p className="text-2xs text-zinc-600">
                  Questões {startFrom}–{Math.min(startFrom + questionCount - 1, selectedExam.total_questions)}, em ordem
                </p>
              )}
            </div>

            <button
              onClick={start}
              disabled={starting || !selectedExam}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet text-white
                         py-2.5 text-sm font-semibold hover:bg-violet-dim transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {starting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Preparando…</>
                : <><BookOpen className="h-4 w-4" /> Iniciar sessão</>
              }
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Option letter badge ───────────────────────────────────────────────────────

function LetterBadge({ letter, state }: {
  letter: string
  state: 'idle' | 'correct' | 'wrong' | 'dim'
}) {
  return (
    <span className={cn(
      'flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold transition-all',
      state === 'idle'    && 'bg-zinc-800 text-zinc-400',
      state === 'correct' && 'bg-ok text-white',
      state === 'wrong'   && 'bg-fail text-white',
      state === 'dim'     && 'bg-zinc-900 text-zinc-700',
    )}>
      {letter}
    </span>
  )
}

// ── Option card ───────────────────────────────────────────────────────────────

function OptionCard({
  letter, text, answered, isSelected, isCorrect, isUserAnswer, onSelect,
}: {
  letter: string; text: string; answered: boolean
  isSelected: boolean; isCorrect: boolean; isUserAnswer: boolean
  onSelect: () => void
}) {
  const state: 'idle' | 'correct' | 'wrong' | 'dim' = !answered
    ? 'idle'
    : isCorrect
      ? 'correct'
      : isUserAnswer ? 'wrong' : 'dim'

  return (
    <button
      onClick={onSelect}
      disabled={answered}
      className={cn(
        'option-card text-left w-full',
        !answered && isSelected && 'border-violet shadow-glow-violet bg-violet-muted',
        !answered && !isSelected && '',
        answered && isCorrect && 'selected-correct',
        answered && isUserAnswer && !isCorrect && 'selected-wrong',
        answered && !isCorrect && !isUserAnswer && 'opacity-40 pointer-events-none',
      )}
    >
      <LetterBadge letter={letter} state={state} />
      <span className={cn(
        'flex-1 text-sm leading-relaxed',
        answered && isCorrect    && 'text-ok font-medium',
        answered && isUserAnswer && !isCorrect && 'text-fail',
        answered && !isCorrect && !isUserAnswer && 'text-zinc-600',
        !answered && 'text-zinc-200',
      )}>
        {text.startsWith('[Imagem — ver no ExamTopics]') ? (
          <a
            href={text.replace('[Imagem — ver no ExamTopics] ', '')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="underline underline-offset-2 text-violet hover:text-violet-dim transition-colors"
          >
            Ver imagem no ExamTopics ↗
          </a>
        ) : text}
      </span>
      {answered && isCorrect    && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-ok" />}
      {answered && isUserAnswer && !isCorrect && <XCircle className="ml-auto h-4 w-4 shrink-0 text-fail" />}
    </button>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────────

function Comments({ comments }: { comments: Comment[] }) {
  const [open, setOpen] = useState(false)
  if (!comments?.length) return null

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-6 py-3
                   text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5" />
          Discussão da comunidade
          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-zinc-400 tabular-nums">
            {comments.length}
          </span>
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="px-6 pb-5 space-y-3 animate-fade-in">
          {comments.map((c, i) => (
            <div key={i} className="rounded-lg bg-bg-overlay border border-border p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="h-5 w-5 rounded-full bg-violet-muted flex items-center justify-center shrink-0">
                  <span className="text-2xs font-bold text-violet">{c.username?.[0]?.toUpperCase() ?? '?'}</span>
                </div>
                <span className="text-xs font-medium text-zinc-300">{c.username}</span>
                {c.selected_answer && (
                  <span className="rounded-full bg-violet-muted px-2 py-0.5 text-2xs font-semibold text-violet">
                    Votou: {c.selected_answer}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Results overlay ───────────────────────────────────────────────────────────

function Results({ correct, total, onRestart }: {
  correct: number; total: number; onRestart: () => void
}) {
  const pct    = Math.round((correct / total) * 100)
  const passed = pct >= 72
  return (
    <div className="flex h-full items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className={cn(
          'mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2',
          passed ? 'border-ok bg-ok-muted' : 'border-fail bg-fail-muted',
        )}>
          {passed
            ? <CheckCircle2 className="h-10 w-10 text-ok" />
            : <XCircle className="h-10 w-10 text-fail" />}
        </div>
        <div>
          <p className="text-5xl font-black tracking-tight text-white">{pct}%</p>
          <p className={cn('mt-1 text-base font-semibold', passed ? 'text-ok' : 'text-fail')}>
            {passed ? 'Aprovado!' : 'Não aprovado'}
          </p>
          <p className="mt-1 text-sm text-zinc-500">{correct} de {total} corretas · mínimo 72%</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="rounded-lg border border-border bg-bg-raised p-4">
            <p className="text-2xs text-zinc-600 uppercase tracking-widest">Corretas</p>
            <p className="mt-1 text-2xl font-bold text-ok">{correct}</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-raised p-4">
            <p className="text-2xs text-zinc-600 uppercase tracking-widest">Erradas</p>
            <p className="mt-1 text-2xl font-bold text-fail">{total - correct}</p>
          </div>
        </div>
        <button onClick={onRestart} className="btn-primary w-full justify-center py-2.5">
          <RotateCcw className="h-4 w-4" /> Nova sessão
        </button>
      </div>
    </div>
  )
}

// ── Main study session ────────────────────────────────────────────────────────

interface SessionProps {
  exam: Exam
  session: SessionPayload
  onRestart: () => void
}

const SESSION_STORAGE_KEY = 'certfarm:active_session'

function saveSessionState(sessionId: number, index: number, answers: Record<number, string>) {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')
    saved[sessionId] = { index, answers, savedAt: Date.now() }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(saved))
  } catch {}
}

function loadSessionState(sessionId: number): { index: number; answers: Record<number, string> } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')
    return saved[sessionId] ?? null
  } catch { return null }
}

function clearSessionState(sessionId: number) {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')
    delete saved[sessionId]
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(saved))
  } catch {}
}

function StudySession({ exam, session, onRestart }: SessionProps) {
  const questions  = session.questions
  const total      = questions.length
  const sessionId  = session.session_id

  // Restore saved state if available
  const saved = loadSessionState(sessionId)

  const [index, setIndex]           = useState(saved?.index ?? 0)
  const [selected, setSelected]     = useState<string | null>(() => {
    if (!saved) return null
    const q = questions[saved.index ?? 0]
    return q ? (saved.answers[q.id] ?? null) : null
  })
  const [answered, setAnswered]     = useState(() => {
    if (!saved) return false
    const q = questions[saved.index ?? 0]
    return q ? (q.id in saved.answers) : false
  })
  const [showNotes, setShowNotes]   = useState(false)
  const [answers, setAnswers]       = useState<Record<number, string>>(saved?.answers ?? {})
  const [finished, setFinished]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [finalScore, setFinalScore] = useState<{ correct: number; total: number } | null>(null)

  const question = questions[index]
  const correct  = Object.entries(answers).filter(
    ([qid, ans]) => questions.find(q => q.id === Number(qid))?.correct_answer === ans
  ).length
  const progress = (Object.keys(answers).length / total) * 100

  const handleAnswer = useCallback((letter: string) => {
    if (answered) return
    setSelected(letter)
    setAnswered(true)
    setAnswers(prev => {
      const next = { ...prev, [question.id]: letter }
      saveSessionState(sessionId, index, next)
      return next
    })
  }, [answered, question.id, sessionId, index])

  const goNext = useCallback(async () => {
    if (index === total - 1) {
      setSubmitting(true)
      const finalAnswers = { ...answers, [question.id]: selected! }
      const payload = Object.entries(finalAnswers).map(([qid, ans]) => ({
        question_id: Number(qid),
        user_answer: ans,
      }))
      try {
        const result = await api.sessions.submit(sessionId, payload)
        setFinalScore({ correct: result.correct, total: result.total })
      } catch {
        setFinalScore({ correct, total })
      }
      clearSessionState(sessionId)
      setFinished(true)
      setSubmitting(false)
      return
    }
    const next = questions[index + 1]
    const prev = answers[next.id]
    const nextIndex = index + 1
    setIndex(nextIndex)
    setSelected(prev ?? null)
    setAnswered(!!prev)
    saveSessionState(sessionId, nextIndex, answers)
  }, [index, total, answers, question.id, selected, sessionId, correct, questions])

  const goPrev = useCallback(() => {
    if (index === 0) return
    const prev = questions[index - 1]
    const prevAns = answers[prev.id]
    const prevIndex = index - 1
    setIndex(prevIndex)
    setSelected(prevAns ?? null)
    setAnswered(!!prevAns)
    saveSessionState(sessionId, prevIndex, answers)
  }, [index, answers, questions, sessionId])

  // Keyboard shortcuts
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return
      const key = e.key.toUpperCase()
      if (!answered && Object.keys(question.options).includes(key)) { handleAnswer(key); return }
      if ((e.key === 'ArrowRight' || e.key === 'Enter') && answered) goNext()
      if (e.key === 'ArrowLeft' && index > 0) goPrev()
      if (key === 'N') setShowNotes(v => !v)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [answered, question.options, handleAnswer, goNext, goPrev, index])

  if (finished && finalScore) {
    return <Results correct={finalScore.correct} total={finalScore.total} onRestart={onRestart} />
  }

  const isCorrect = selected === question.correct_answer

  return (
    <div className="flex h-full animate-fade-in">
      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <BookOpen className="h-3.5 w-3.5" />
              <span>Modo Estudo</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-zinc-400 truncate max-w-40">{exam.name}</span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1">
              <span className="text-xs font-semibold text-white tabular-nums">{index + 1}</span>
              <span className="text-xs text-zinc-600">/</span>
              <span className="text-xs text-zinc-500 tabular-nums">{total}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live score */}
            {Object.keys(answers).length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <BarChart2 className="h-3.5 w-3.5 text-zinc-600" />
                <span className={cn(
                  'font-semibold tabular-nums',
                  (correct / Object.keys(answers).length) >= 0.72 ? 'text-ok' : 'text-zinc-400',
                )}>
                  {Math.round((correct / Object.keys(answers).length) * 100)}%
                </span>
              </div>
            )}

            {/* Keyboard hints */}
            <div className="hidden md:flex items-center gap-2 text-2xs text-zinc-700">
              {!answered
                ? ['A','B','C','D'].slice(0, Object.keys(question.options).length).map(k => (
                    <span key={k} className="flex items-center gap-1"><kbd className="kbd">{k}</kbd></span>
                  ))
                : <span className="flex items-center gap-1"><kbd className="kbd">→</kbd> próxima</span>
              }
              <span className="text-zinc-800">·</span>
              <span className="flex items-center gap-1"><kbd className="kbd">N</kbd> notas</span>
            </div>

            {/* Notes toggle */}
            <button
              onClick={() => setShowNotes(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-all',
                showNotes ? 'bg-violet-muted text-violet' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200',
              )}
            >
              <StickyNote className="h-3.5 w-3.5" />
              Notas
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-zinc-800 shrink-0">
          <div className="h-full bg-violet transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        {/* Question area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-8 py-8 space-y-7">

            {/* Feedback banner */}
            {answered && (
              <div className={cn(
                'flex items-center gap-3 rounded-lg px-4 py-3 border animate-pop',
                isCorrect
                  ? 'bg-ok-muted border-ok/30 text-ok'
                  : 'bg-fail-muted border-fail/30 text-fail',
              )}>
                {isCorrect
                  ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                  : <XCircle className="h-5 w-5 shrink-0" />}
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {isCorrect ? 'Correto!' : `Incorreto — resposta: ${question.correct_answer}`}
                  </p>
                  <p className="text-xs opacity-75 mt-0.5">
                    {isCorrect
                      ? 'Ótimo! Veja a discussão abaixo ou avance.'
                      : `Você escolheu ${selected}. Veja a explicação na discussão.`}
                  </p>
                </div>
                <button
                  onClick={goNext}
                  disabled={submitting}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium border transition-all',
                    isCorrect
                      ? 'border-ok/30 text-ok hover:bg-ok/10'
                      : 'border-fail/30 text-fail hover:bg-fail/10',
                  )}
                >
                  {submitting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <>{index === total - 1 ? 'Ver resultado' : 'Próxima'} <ArrowRight className="h-3.5 w-3.5" /></>
                  }
                </button>
              </div>
            )}

            {/* Topic + question number */}
            <div className="flex items-center gap-2 flex-wrap">
              {question.topic && (
                <span className="rounded-full border border-border bg-bg-raised px-3 py-1 text-xs font-medium text-zinc-400">
                  {question.topic}
                </span>
              )}
              <span className="text-xs text-zinc-700">
                Q{question.question_number} · #{question.id}
              </span>
            </div>

            {/* Question text */}
            <p className="text-base leading-relaxed text-zinc-100 font-[450]">
              {question.question_text}
            </p>

            {/* Options */}
            <div className="space-y-2.5">
              {Object.entries(question.options).map(([letter, text]) => (
                <OptionCard
                  key={letter}
                  letter={letter}
                  text={text}
                  answered={answered}
                  isSelected={selected === letter}
                  isCorrect={letter === question.correct_answer}
                  isUserAnswer={selected === letter}
                  onSelect={() => handleAnswer(letter)}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={goPrev}
                disabled={index === 0}
                className="btn-ghost disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>

              {!answered && (
                <p className="text-xs text-zinc-700">Selecione uma alternativa para continuar</p>
              )}

              <button
                onClick={goNext}
                disabled={!answered || submitting}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  answered && !submitting
                    ? 'bg-violet text-white hover:bg-violet-dim'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
                )}
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</>
                  : <>{index === total - 1 ? 'Ver resultado' : 'Próxima'} <ChevronRight className="h-4 w-4" /></>
                }
              </button>
            </div>

            {/* Dot navigator */}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {questions.map((q, i) => {
                const ans   = answers[q.id]
                const done  = !!ans
                const ok    = ans === q.correct_answer
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setIndex(i)
                      const a = answers[q.id]
                      setSelected(a ?? null)
                      setAnswered(!!a)
                    }}
                    title={`Q${q.question_number}`}
                    className={cn(
                      'h-2 w-2 rounded-full transition-all',
                      i === index && 'scale-150',
                      !done && (i === index ? 'bg-violet' : 'bg-zinc-700'),
                      done && ok  && 'bg-ok',
                      done && !ok && 'bg-fail',
                    )}
                  />
                )
              })}
            </div>
          </div>

          {/* Comments section — appears after answering */}
          {answered && (
            <div className="border-t border-border animate-fade-in">
              <Comments comments={question.comments ?? []} />
            </div>
          )}
        </div>
      </div>

      {/* Notes panel */}
      {showNotes && (
        <NotesPanel
          questionId={question.id}
          questionLabel={`Q${question.question_number} · ${question.topic ?? 'Geral'}`}
        />
      )}
    </div>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function StudyPage() {
  const [session, setSession]   = useState<SessionPayload | null>(null)
  const [exam, setExam]         = useState<Exam | null>(null)

  const handleStart = (e: Exam, s: SessionPayload) => {
    setExam(e)
    setSession(s)
  }

  const handleRestart = () => {
    setSession(null)
    setExam(null)
  }

  if (!session || !exam) {
    return <SetupScreen onStart={handleStart} />
  }

  return <StudySession exam={exam} session={session} onRestart={handleRestart} />
}
