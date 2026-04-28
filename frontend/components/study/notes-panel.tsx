'use client'

import { useState, useEffect, useRef } from 'react'
import { StickyNote, Plus, Save, Trash2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  questionId: number
  text: string
  createdAt: string
}

interface NotesPanelProps {
  questionId: number
  questionLabel: string
}

const STORAGE_KEY = 'certfarm:notes'

function loadNotes(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

export function NotesPanel({ questionId, questionLabel }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load from localStorage
  useEffect(() => {
    setNotes(loadNotes())
  }, [])

  const questionNotes = notes.filter(n => n.questionId === questionId)

  const addNote = () => {
    const text = draft.trim()
    if (!text) return
    const note: Note = {
      id: crypto.randomUUID(),
      questionId,
      text,
      createdAt: new Date().toISOString(),
    }
    const updated = [...notes, note]
    setNotes(updated)
    saveNotes(updated)
    setDraft('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id)
    setNotes(updated)
    saveNotes(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      addNote()
    }
    e.stopPropagation() // don't trigger question keyboard shortcuts
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-bg-raised animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <StickyNote className="h-4 w-4 text-violet shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white">Anotações</p>
          <p className="text-2xs text-zinc-600 truncate">{questionLabel}</p>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {questionNotes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
            <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center">
              <Plus className="h-4 w-4 text-zinc-600" />
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Nenhuma anotação para esta questão.
              <br />Use <kbd className="kbd">⌘ Enter</kbd> para salvar.
            </p>
          </div>
        )}

        {questionNotes.map(note => (
          <div
            key={note.id}
            className="group relative rounded-lg bg-bg-overlay border border-border p-3"
          >
            <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {note.text}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-2xs text-zinc-700">
                {new Date(note.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <button
                onClick={() => deleteNote(note.id)}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-fail transition-all"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Quick note input */}
      <div className="border-t border-border p-3 space-y-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Adicionar anotação rápida…"
          rows={3}
          className="w-full resize-none rounded-lg bg-bg-overlay border border-border
                     px-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-700
                     focus:outline-none focus:border-violet focus:ring-1 focus:ring-violet/30
                     transition-colors leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <span className="text-2xs text-zinc-700">
            <kbd className="kbd">⌘</kbd> <kbd className="kbd">↵</kbd> salvar
          </span>
          <button
            onClick={addNote}
            disabled={!draft.trim()}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-all',
              draft.trim()
                ? 'bg-violet text-white hover:bg-violet-dim'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
            )}
          >
            {saved ? (
              <>Salvo <span className="text-ok">✓</span></>
            ) : (
              <><Save className="h-3 w-3" /> Salvar</>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
