'use client'

import { Zap, Clock, Target, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function ExamPage() {
  return (
    <div className="flex h-full items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-violet-muted border border-violet/20">
          <Zap className="h-7 w-7 text-violet" />
        </div>

        <div>
          <h1 className="text-xl font-semibold text-white">Modo Simulado</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            65 questões aleatórias · Tempo corrido · Sem feedback imediato
          </p>
        </div>

        <div className="rounded-lg border border-border bg-bg-raised p-4 space-y-3 text-left">
          {[
            { icon: Clock,        text: 'Timer contado a partir do início' },
            { icon: Target,       text: 'Resultado revelado apenas ao finalizar' },
            { icon: AlertCircle,  text: 'Aprovação exige mínimo de 72%' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-xs text-zinc-400">
              <Icon className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
              {text}
            </div>
          ))}
        </div>

        <button className="btn-primary w-full justify-center py-2.5">
          <Zap className="h-4 w-4" />
          Iniciar simulado (em breve)
        </button>

        <p className="text-xs text-zinc-700">
          O Modo Simulado completo será integrado ao backend em breve.
        </p>
      </div>
    </div>
  )
}
