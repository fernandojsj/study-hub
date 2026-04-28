'use client'

import { useState, useEffect } from 'react'
import {
  Award, Circle, CheckCircle2, BookOpen, Loader2, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { Exam } from '@/lib/api'

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
  return m ? m[1].toUpperCase() : '—'
}

function ExamCard({ exam }: { exam: Exam }) {
  const color = vendorColor(exam.base_url)
  const ready = exam.total_questions > 0

  return (
    <div className={cn(
      'rounded-lg border bg-bg-raised overflow-hidden transition-all',
      ready ? 'border-border hover:border-border-strong' : 'border-border opacity-60',
    )}>
      <div className="flex items-start gap-3 p-5">
        <Circle className="h-2.5 w-2.5 mt-1 fill-current shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <p className="text-2xs font-mono text-zinc-600">{examCode(exam.base_url)}</p>
          <p className="text-sm font-semibold text-white leading-snug mt-0.5">{exam.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{vendorLabel(exam.base_url)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border mx-5 mb-4 rounded-md overflow-hidden border border-border">
        <div className="bg-bg-raised px-3 py-2">
          <p className="text-2xs text-zinc-600">Questões</p>
          <p className={cn('text-lg font-bold tabular-nums mt-0.5', ready ? 'text-white' : 'text-zinc-700')}>
            {exam.total_questions}
          </p>
        </div>
        <div className="bg-bg-raised px-3 py-2">
          <p className="text-2xs text-zinc-600">Status</p>
          <p className={cn('text-xs font-medium mt-1 flex items-center gap-1', ready ? 'text-ok' : 'text-zinc-600')}>
            {ready
              ? <><CheckCircle2 className="h-3 w-3" />Disponível</>
              : <>Sem questões</>}
          </p>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        {ready ? (
          <Link
            href="/study"
            className="flex items-center justify-center gap-2 rounded-md bg-violet text-white
                       px-4 py-2 text-xs font-semibold hover:bg-violet-dim transition-all w-full"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Estudar agora
          </Link>
        ) : (
          <p className="text-center text-2xs text-zinc-600 py-1">
            Questões ainda não importadas
          </p>
        )}
      </div>
    </div>
  )
}

export default function CertificationsPage() {
  const [exams, setExams]       = useState<Exam[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)

  useEffect(() => {
    api.exams.list()
      .then(data => setExams(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const ready  = exams.filter(e => e.total_questions > 0)
  const total  = exams.reduce((s, e) => s + e.total_questions, 0)

  return (
    <div className="p-8 space-y-7 animate-fade-in">

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-600 mb-1">
          {ready.length} disponíveis · {total.toLocaleString('pt-BR')} questões
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Provas disponíveis</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Escolha uma prova e comece a estudar.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-fail/20 bg-fail-muted px-4 py-3">
          <AlertCircle className="h-4 w-4 text-fail shrink-0 mt-0.5" />
          <p className="text-sm text-fail">Backend offline — inicie o servidor FastAPI.</p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-lg border border-border bg-bg-raised p-5 space-y-3 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-800 mt-1 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-2 w-16 rounded bg-zinc-800" />
                  <div className="h-4 w-44 rounded bg-zinc-800" />
                </div>
              </div>
              <div className="h-14 rounded bg-zinc-800" />
              <div className="h-8 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && exams.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
          <Award className="h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">Nenhuma prova disponível ainda.</p>
          <p className="text-xs text-zinc-600">Aguarde o administrador importar as questões.</p>
        </div>
      )}

      {!loading && exams.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {exams.map(exam => <ExamCard key={exam.id} exam={exam} />)}
        </div>
      )}
    </div>
  )
}
