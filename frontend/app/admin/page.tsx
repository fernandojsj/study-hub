'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Award, Plus, Trash2, Download, Circle,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  BookOpen, RotateCcw, Loader2, AlertCircle, Lock, ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ScrapePanel } from '@/components/certifications/scrape-panel'
import { api } from '@/lib/api'
import type { Exam } from '@/lib/api'

const STORAGE_KEY = 'certfarm_admin_auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function vendorColor(url: string) {
  if (url.includes('/google/'))    return '#4ade80'
  if (url.includes('/amazon/'))    return '#f59e0b'
  if (url.includes('/microsoft/')) return '#60a5fa'
  if (url.includes('/hashicorp/')) return '#a78bfa'
  return '#8b5cf6'
}

function vendorLabel(url: string) {
  if (url.includes('/google/'))    return 'Google Cloud'
  if (url.includes('/amazon/'))    return 'Amazon Web Services'
  if (url.includes('/microsoft/')) return 'Microsoft Azure'
  if (url.includes('/hashicorp/')) return 'HashiCorp'
  const m = url.match(/examtopics\.com\/exams\/([^/]+)\//)
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : 'Unknown'
}

function examCode(url: string) {
  const m = url.match(/examtopics\.com\/exams\/[^/]+\/([^/]+)\//)
  if (!m) return '—'
  return m[1].toUpperCase()
}

// ── Password gate ─────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.admin.verify(password)
      sessionStorage.setItem(STORAGE_KEY, '1')
      onAuth()
    } catch {
      setError('Senha incorreta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center animate-fade-in">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet/10 border border-violet/20">
            <Lock className="h-5 w-5 text-violet" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-white">Área restrita</p>
            <p className="text-xs text-zinc-500 mt-1">Acesso exclusivo para administradores.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Senha de administrador"
            autoFocus
            className="w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-zinc-200
                       placeholder:text-zinc-700 focus:outline-none focus:border-violet
                       focus:ring-1 focus:ring-violet/30 transition-colors"
          />
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-fail">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet text-white
                       py-2.5 text-sm font-semibold hover:bg-violet-dim transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Create exam form ──────────────────────────────────────────────────────────

function CreateForm({ onCreated, onCancel }: { onCreated: (e: Exam) => void; onCancel: () => void }) {
  const [name, setName]       = useState('')
  const [url, setUrl]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), base_url: url.trim() }),
    })
    if (!res.ok) { setError('Falha ao criar.'); setLoading(false); return }
    const exam: Exam = await res.json()
    onCreated({ ...exam, total_questions: 0 })
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-bg-raised p-5 space-y-4 animate-fade-in">
      <p className="text-sm font-semibold text-white">Nova certificação</p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-2xs font-medium uppercase tracking-widest text-zinc-500">Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Professional Cloud Architect" autoFocus
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-zinc-200
                       placeholder:text-zinc-700 focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30" />
        </div>
        <div className="space-y-1.5">
          <label className="text-2xs font-medium uppercase tracking-widest text-zinc-500">URL do ExamTopics</label>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://www.examtopics.com/exams/google/professional-cloud-architect/"
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs text-zinc-200
                       placeholder:text-zinc-700 font-mono focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30" />
        </div>
      </div>
      {error && <p className="flex items-center gap-2 text-xs text-fail"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading || !name.trim() || !url.trim()}
          className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold bg-violet text-white
                     hover:bg-violet-dim transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Criar
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ── Cert card (admin) ─────────────────────────────────────────────────────────

function CertCard({ exam, onDelete, onQuestionsUpdated }: {
  exam: Exam; onDelete: (id: number) => void; onQuestionsUpdated: (id: number, count: number) => void
}) {
  const [showScrape, setShowScrape]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmClear, setConfirmClear]   = useState(false)
  const [clearing, setClearing]           = useState(false)

  const color = vendorColor(exam.base_url)
  const code  = examCode(exam.base_url)

  const clearQuestions = async () => {
    setClearing(true)
    await fetch(`/api/exams/${exam.id}/questions`, { method: 'DELETE' })
    onQuestionsUpdated(exam.id, 0)
    setClearing(false); setConfirmClear(false)
  }
  const deleteExam = async () => {
    await fetch(`/api/exams/${exam.id}`, { method: 'DELETE' })
    onDelete(exam.id)
  }

  return (
    <div className="rounded-lg border border-border bg-bg-raised overflow-hidden hover:border-border-strong transition-colors">
      <div className="flex items-start gap-3 p-5">
        <Circle className="h-2.5 w-2.5 mt-1 fill-current shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <p className="text-2xs font-mono text-zinc-600">{code}</p>
          <p className="text-sm font-semibold text-white leading-snug mt-0.5 truncate">{exam.name}</p>
          <p className="text-xs text-zinc-600 mt-0.5">{vendorLabel(exam.base_url)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border mx-5 mb-4 rounded-md overflow-hidden border border-border">
        <div className="bg-bg-raised px-3 py-2">
          <p className="text-2xs text-zinc-600">Questões</p>
          <p className={cn('text-lg font-bold tabular-nums mt-0.5', exam.total_questions > 0 ? 'text-white' : 'text-zinc-700')}>
            {exam.total_questions}
          </p>
        </div>
        <div className="bg-bg-raised px-3 py-2">
          <p className="text-2xs text-zinc-600">Status</p>
          <p className={cn('text-xs font-medium mt-1 flex items-center gap-1', exam.total_questions > 0 ? 'text-ok' : 'text-zinc-600')}>
            {exam.total_questions > 0
              ? <><CheckCircle2 className="h-3 w-3" />Pronto</>
              : <><XCircle className="h-3 w-3" />Sem questões</>}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border px-3 py-2.5">
        <button onClick={() => setShowScrape(v => !v)}
          className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            showScrape ? 'bg-violet text-white' : 'bg-bg text-zinc-400 hover:text-white hover:bg-zinc-800 border border-border')}>
          <Download className="h-3.5 w-3.5" />
          {showScrape ? 'Fechar' : 'Importar questões'}
          {showScrape ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>

        {exam.total_questions > 0 && (
          <Link href="/study"
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <BookOpen className="h-3.5 w-3.5" />Estudar
          </Link>
        )}

        <div className="flex items-center gap-1 ml-1">
          {exam.total_questions > 0 && (
            confirmClear ? (
              <span className="flex items-center gap-1">
                <button onClick={clearQuestions} disabled={clearing}
                  className="rounded px-2 py-1 text-2xs bg-warn-muted text-warn hover:bg-warn/20 transition-colors">
                  {clearing ? '…' : 'Limpar'}
                </button>
                <button onClick={() => setConfirmClear(false)} className="rounded px-1.5 py-1 text-2xs text-zinc-600 hover:text-zinc-400">✕</button>
              </span>
            ) : (
              <button onClick={() => setConfirmClear(true)} title="Limpar questões"
                className="rounded p-1.5 text-zinc-700 hover:text-warn hover:bg-warn-muted transition-colors">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )
          )}
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button onClick={deleteExam} className="rounded px-2 py-1 text-2xs bg-fail-muted text-fail hover:bg-fail/20 transition-colors">Excluir</button>
              <button onClick={() => setConfirmDelete(false)} className="rounded px-1.5 py-1 text-2xs text-zinc-600 hover:text-zinc-400">✕</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} title="Excluir"
              className="rounded p-1.5 text-zinc-700 hover:text-fail hover:bg-fail-muted transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {showScrape && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <ScrapePanel examId={exam.id} defaultUrl={exam.base_url}
            onClose={() => setShowScrape(false)}
            onComplete={(saved) => onQuestionsUpdated(exam.id, saved)} />
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed]           = useState(false)
  const [checking, setChecking]       = useState(true)
  const [exams, setExams]             = useState<Exam[]>([])
  const [loading, setLoading]         = useState(true)
  const [showCreate, setShowCreate]   = useState(false)
  const [fetchError, setFetchError]   = useState(false)

  // Check existing auth from sessionStorage
  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') setAuthed(true)
    setChecking(false)
  }, [])

  const loadExams = useCallback(async () => {
    try {
      const data = await fetch('/api/exams').then(r => r.json())
      setExams(Array.isArray(data) ? data : [])
    } catch { setFetchError(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (authed) loadExams() }, [authed, loadExams])

  if (checking) return null

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />

  const totalQuestions = exams.reduce((s, e) => s + e.total_questions, 0)

  return (
    <div className="p-8 space-y-7 animate-fade-in">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-3.5 w-3.5 text-violet" />
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">
              {exams.length} {exams.length === 1 ? 'certificação' : 'certificações'}
              {totalQuestions > 0 && ` · ${totalQuestions.toLocaleString('pt-BR')} questões`}
            </p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Admin · Certificações</h1>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
            showCreate ? 'bg-zinc-800 text-zinc-300' : 'bg-violet text-white hover:bg-violet-dim')}>
          <Plus className="h-4 w-4" />
          {showCreate ? 'Cancelar' : 'Nova certificação'}
        </button>
      </div>

      {showCreate && <CreateForm onCreated={e => { setExams(p => [...p, e]); setShowCreate(false) }} onCancel={() => setShowCreate(false)} />}

      {fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-fail/20 bg-fail-muted px-4 py-3">
          <AlertCircle className="h-4 w-4 text-fail shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-fail">Backend não encontrado</p>
            <code className="block mt-1 text-2xs font-mono text-zinc-600">
              cd ~/Projetos/study-hub/backend && source .venv/bin/activate && uvicorn main:app --reload
            </code>
          </div>
        </div>
      )}

      {loading && !fetchError && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-lg border border-border bg-bg-raised p-5 space-y-3 animate-pulse">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
              <div className="h-4 w-40 rounded bg-zinc-800" />
              <div className="h-12 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && !fetchError && exams.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <Award className="h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">Nenhuma certificação cadastrada ainda.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" />Criar primeira certificação
          </button>
        </div>
      )}

      {!loading && exams.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {exams.map(exam => (
            <CertCard key={exam.id} exam={exam}
              onDelete={id => setExams(p => p.filter(e => e.id !== id))}
              onQuestionsUpdated={(id, count) => setExams(p => p.map(e => e.id === id ? { ...e, total_questions: count } : e))} />
          ))}
          <button onClick={() => setShowCreate(true)}
            className="rounded-lg border border-dashed border-border min-h-[180px] flex flex-col items-center justify-center gap-3
                       text-zinc-600 hover:border-border-strong hover:text-zinc-400 hover:bg-zinc-900/40 transition-all">
            <div className="h-10 w-10 rounded-full bg-zinc-900 border border-border flex items-center justify-center">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm">Adicionar certificação</p>
          </button>
        </div>
      )}
    </div>
  )
}
