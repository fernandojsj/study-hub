// Thin typed wrappers over the FastAPI backend.
// All fetches go through the Next.js rewrite: /api/* → localhost:8000/api/*

export interface Exam {
  id: number
  name: string
  base_url: string
  total_questions: number
  created_at: string
}

export interface Question {
  id: number
  exam_id: number
  question_number: number
  url: string | null
  question_text: string
  options: Record<string, string>
  correct_answer: string
  topic: string
  correct_answer_full?: string
  comments?: Comment[]
}

export interface Comment {
  username: string
  selected_answer: string
  text: string
}

export interface SessionPayload {
  session_id: number
  total: number
  questions: (Question & { correct_answer: string; comments: Comment[] })[]
}

export interface SubmitResult {
  session_id: number
  score: number
  correct: number
  total: number
  results: {
    question_id: number
    user_answer: string
    correct_answer: string
    is_correct: boolean
    question_text: string
    options: Record<string, string>
    topic: string
    comments: Comment[]
  }[]
}

export interface SessionSummary {
  id: number
  exam_id: number
  exam_name: string
  score: number
  total_questions: number
  started_at: string
  completed_at: string | null
}

export interface SessionResults {
  session_id: number
  exam_id: number
  exam_name: string
  score: number
  correct: number
  total: number
  started_at: string
  completed_at: string
  results: {
    question_id: number
    question_number: number
    question_text: string
    options: Record<string, string>
    user_answer: string
    correct_answer: string
    is_correct: boolean
    topic: string
    comments: Comment[]
  }[]
}

export interface DashboardData {
  total_sessions: number
  average_score: number
  best_score: number
  worst_score: number
  topic_performance: Record<string, { correct: number; total: number; percentage: number }>
  history: {
    id: number
    exam_id: number
    score: number
    total_questions: number
    started_at: string
    completed_at: string | null
  }[]
}

export const api = {
  exams: {
    list: (): Promise<Exam[]>         => fetch('/api/exams').then(r => r.json()),
    create: (name: string, base_url: string): Promise<Exam> =>
      fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, base_url }),
      }).then(r => r.json()),
    delete: (id: number) =>
      fetch(`/api/exams/${id}`, { method: 'DELETE' }),
    clearQuestions: (id: number) =>
      fetch(`/api/exams/${id}/questions`, { method: 'DELETE' }),
  },

  questions: {
    list: (examId: number): Promise<Question[]> =>
      fetch(`/api/questions?exam_id=${examId}`).then(r => r.json()),
  },

  sessions: {
    list: (): Promise<SessionSummary[]> =>
      fetch('/api/sessions').then(r => r.json()),

    create: (examId: number, questionCount: number, startFrom?: number): Promise<SessionPayload> =>
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id: examId,
          question_count: questionCount,
          ...(startFrom != null ? { start_from: startFrom } : {}),
        }),
      }).then(r => r.json()),

    submit: (
      sessionId: number,
      answers: { question_id: number; user_answer: string }[],
    ): Promise<SubmitResult> =>
      fetch(`/api/sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      }).then(r => r.json()),

    results: (sessionId: number): Promise<SessionResults> =>
      fetch(`/api/sessions/${sessionId}/results`).then(r => r.json()),
  },

  dashboard: {
    get: (): Promise<DashboardData> => fetch('/api/dashboard').then(r => r.json()),
    getByExam: (examId: number): Promise<DashboardData> =>
      fetch(`/api/dashboard/${examId}`).then(r => r.json()),
  },

  scrape: {
    startAll: (examId: number, examUrl: string, totalQuestions: number) =>
      fetch('/api/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: examId, exam_url: examUrl, total_questions: totalQuestions }),
      }).then(r => r.json()),

    status: (examId: number) =>
      fetch(`/api/scrape/status/${examId}`).then(r => r.json()),
  },

  admin: {
    verify: (password: string): Promise<{ ok: boolean }> =>
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }).then(r => r.ok ? r.json() : Promise.reject(r)),
  },
}
