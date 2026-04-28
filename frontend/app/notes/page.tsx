'use client'

import { useState, useEffect } from 'react'
import { StickyNote, Trash2, Search, BookOpen } from 'lucide-react'

interface Note {
  id: string
  questionId: number
  text: string
  createdAt: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('certfarm:notes') ?? '[]')
      setNotes(stored)
    } catch {}
  }, [])

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id)
    setNotes(updated)
    localStorage.setItem('certfarm:notes', JSON.stringify(updated))
  }

  const filtered = notes.filter(n =>
    n.text.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Anotações</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {notes.length} anotações salvas localmente
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar nas anotações…"
          className="w-full rounded-lg border border-border bg-bg-raised pl-9 pr-4 py-2.5
                     text-sm text-zinc-200 placeholder:text-zinc-600
                     focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30"
        />
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-3 text-center">
          <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center">
            <StickyNote className="h-6 w-6 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-500">
            {notes.length === 0 ? 'Nenhuma anotação ainda.' : 'Nenhum resultado.'}
          </p>
          {notes.length === 0 && (
            <p className="text-xs text-zinc-700">
              Adicione anotações rápidas durante o Modo Estudo com o painel lateral.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(note => (
          <div
            key={note.id}
            className="group rounded-lg border border-border bg-bg-raised p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap flex-1">
                {note.text}
              </p>
              <button
                onClick={() => deleteNote(note.id)}
                className="opacity-0 group-hover:opacity-100 shrink-0 text-zinc-600 hover:text-fail transition-all mt-0.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-2xs text-zinc-700">
              <BookOpen className="h-3 w-3" />
              <span>Q{note.questionId}</span>
              <span>·</span>
              <span>
                {new Date(note.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
