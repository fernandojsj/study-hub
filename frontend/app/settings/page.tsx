'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Key, CheckCircle2, XCircle, Loader2,
  AlertTriangle, ExternalLink, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type CookieStatus = 'unknown' | 'checking' | 'valid' | 'empty' | 'error'

export default function SettingsPage() {
  const [cookies, setCookies]       = useState('')
  const [status, setStatus]         = useState<CookieStatus>('unknown')
  const [saving, setSaving]         = useState(false)
  const [savedMsg, setSavedMsg]     = useState('')
  const [currentCookies, setCurrent] = useState('')

  useEffect(() => {
    setStatus('checking')
    fetch('/api/settings/cookies')
      .then(r => r.json())
      .then(data => {
        const has = data.configured ?? data.has_cookies
        setCurrent(data.preview ?? '')
        setStatus(has ? 'valid' : 'empty')
      })
      .catch(() => setStatus('error'))
  }, [])

  const save = async () => {
    if (!cookies.trim()) return
    setSaving(true)
    setSavedMsg('')
    try {
      const r = await fetch('/api/settings/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookies.trim() }),
      })
      if (r.ok) {
        setSavedMsg('Cookies salvos com sucesso.')
        setStatus('valid')
        setCookies('')
        setCurrent(cookies.trim().slice(0, 60) + '…')
      } else {
        setSavedMsg('Erro ao salvar cookies.')
      }
    } catch {
      setSavedMsg('Falha de conexão.')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    await fetch('/api/settings/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies: '' }),
    })
    setStatus('empty')
    setCurrent('')
    setSavedMsg('Cookies removidos.')
  }

  return (
    <div className="min-h-full p-8 space-y-8 animate-fade-in">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="h-4 w-4 text-violet" />
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-600">Configurações</p>
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Configurações</h1>
      </div>

      {/* Cookie section */}
      <div className="max-w-xl space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Key className="h-3.5 w-3.5 text-violet" />
            <p className="text-sm font-semibold text-white">Cookies do ExamTopics</p>
          </div>
          <p className="text-xs text-zinc-500">
            Necessário para importar questões além da prévia gratuita (~130 questões).
            Com login, todas as questões do exame ficam disponíveis.
          </p>
        </div>

        {/* Why needed */}
        <div className="flex items-start gap-2 rounded-md bg-zinc-900/60 border border-border px-3 py-2.5">
          <Info className="h-3.5 w-3.5 text-violet shrink-0 mt-0.5" />
          <div className="space-y-1 text-2xs text-zinc-500 leading-relaxed">
            <p>O ExamTopics oferece <strong className="text-zinc-400">~13 páginas gratuitas</strong> (~130 questões) por exame.
            Questões além disso exigem uma conta autenticada.</p>
            <p>Seus cookies ficam <strong className="text-zinc-400">apenas no servidor local</strong> — nunca são enviados a terceiros.</p>
          </div>
        </div>

        {/* Current status */}
        <div className={cn(
          'flex items-center gap-3 rounded-lg border px-4 py-3',
          status === 'valid' ? 'border-ok/25 bg-ok/5' :
          status === 'empty' ? 'border-warn/25 bg-warn/5' :
          'border-border bg-bg-raised'
        )}>
          {status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          {status === 'valid'    && <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />}
          {status === 'empty'    && <AlertTriangle className="h-4 w-4 text-warn shrink-0" />}
          {status === 'error'    && <XCircle className="h-4 w-4 text-fail shrink-0" />}
          <div className="min-w-0">
            <p className={cn(
              'text-xs font-medium',
              status === 'valid' ? 'text-ok' :
              status === 'empty' ? 'text-warn' :
              'text-zinc-400'
            )}>
              {status === 'checking' && 'Verificando…'}
              {status === 'valid'    && 'Cookies configurados'}
              {status === 'empty'    && 'Sem cookies — limitado a ~130 questões por exame'}
              {status === 'error'    && 'Erro ao verificar status'}
            </p>
            {status === 'valid' && currentCookies && (
              <p className="text-2xs text-zinc-600 font-mono truncate mt-0.5">{currentCookies}</p>
            )}
          </div>
          {status === 'valid' && (
            <button
              onClick={clear}
              className="ml-auto text-2xs text-zinc-600 hover:text-fail transition-colors shrink-0"
            >
              Remover
            </button>
          )}
        </div>

        {/* How to get cookies */}
        <div className="rounded-lg border border-border bg-bg-raised p-4 space-y-3">
          <p className="text-xs font-semibold text-white">Como obter os cookies</p>
          <ol className="space-y-2 text-2xs text-zinc-500 leading-relaxed list-none">
            {[
              <>Acesse <a href="https://www.examtopics.com" target="_blank" rel="noopener noreferrer" className="text-violet underline underline-offset-2 inline-flex items-center gap-0.5">examtopics.com <ExternalLink className="h-2.5 w-2.5" /></a> e faça login.</>,
              'Abra o DevTools (F12) → aba "Network".',
              'Recarregue a página e clique em qualquer requisição para examtopics.com.',
              <>Na aba "Headers", copie o valor completo de <code className="bg-zinc-800 px-1 rounded text-zinc-300">Cookie:</code></>,
              'Cole abaixo e salve.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 h-4 w-4 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-2xs font-semibold mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <label className="text-2xs font-medium uppercase tracking-widest text-zinc-500">
            Cookie header value
          </label>
          <textarea
            value={cookies}
            onChange={e => setCookies(e.target.value)}
            rows={4}
            placeholder="_gid=GA1.2...; sessionid=abc123...; cf_clearance=..."
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-xs font-mono text-zinc-300
                       placeholder:text-zinc-700 focus:outline-none focus:border-violet focus:ring-1
                       focus:ring-violet/20 resize-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || !cookies.trim()}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-all',
              cookies.trim() && !saving
                ? 'bg-violet text-white hover:bg-violet-dim'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            Salvar cookies
          </button>
          {savedMsg && (
            <p className={cn(
              'text-xs',
              savedMsg.includes('sucesso') ? 'text-ok' : 'text-fail'
            )}>
              {savedMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
