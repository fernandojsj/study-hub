import os
import random
from datetime import datetime
from typing import Optional

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "certfarm2024")

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, engine, get_db, SessionLocal
from models import Exam, ExamSession, Question, SessionAnswer
from scraper import ExamTopicsScraper

Base.metadata.create_all(bind=engine)

# ── DB migration: add columns added after initial release ──────────────────
def _run_migrations():
    from sqlalchemy import inspect, text
    with engine.connect() as conn:
        try:
            cols = [c["name"] for c in inspect(engine).get_columns("questions")]
            if "comments" not in cols:
                conn.execute(text("ALTER TABLE questions ADD COLUMN comments JSON"))
                conn.commit()
                print("[db] Migration applied: added 'comments' column")
            if "exam_question_id" not in cols:
                conn.execute(text("ALTER TABLE questions ADD COLUMN exam_question_id INTEGER"))
                conn.commit()
                print("[db] Migration applied: added 'exam_question_id' column")
        except Exception:
            pass  # table may not exist yet; create_all handles it

_run_migrations()

app = FastAPI(title="Study Hub API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scraper = ExamTopicsScraper()

# In-memory scraping progress tracker (resets on restart)
_scrape_status: dict[int, dict] = {}


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic schemas
# ──────────────────────────────────────────────────────────────────────────────

class ExamCreate(BaseModel):
    name: str
    base_url: str


class QuestionCreate(BaseModel):
    exam_id: int
    question_number: int
    url: Optional[str] = None
    question_text: str
    options: dict[str, str]
    correct_answer: str
    topic: Optional[str] = "General"


class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    options: Optional[dict[str, str]] = None
    correct_answer: Optional[str] = None
    topic: Optional[str] = None


class ScrapeRequest(BaseModel):
    exam_id: int
    base_url: str
    start: int = 1
    end: int = 100


class IndexScrapeRequest(BaseModel):
    exam_id: int
    exam_url: str        # e.g. https://www.examtopics.com/exams/google/professional-cloud-architect/
    start_page: int = 1
    end_page: int = 10


class AllScrapeRequest(BaseModel):
    exam_id: int
    exam_url: str
    total_questions: int = 100


class SessionCreate(BaseModel):
    exam_id: int
    question_count: int = 65
    start_from: Optional[int] = None  # if set, select sequentially from this question_number


class AnswerSubmit(BaseModel):
    question_id: int
    user_answer: str


class BulkAnswerSubmit(BaseModel):
    answers: list[AnswerSubmit]


# ──────────────────────────────────────────────────────────────────────────────
# Exams
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/exams")
def list_exams(db: Session = Depends(get_db)):
    exams = db.query(Exam).all()
    return [
        {
            "id": e.id,
            "name": e.name,
            "base_url": e.base_url,
            "total_questions": db.query(Question).filter(Question.exam_id == e.id).count(),
            "created_at": e.created_at.isoformat(),
        }
        for e in exams
    ]


@app.post("/api/exams", status_code=201)
def create_exam(payload: ExamCreate, db: Session = Depends(get_db)):
    exam = Exam(name=payload.name, base_url=payload.base_url)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return {"id": exam.id, "name": exam.name, "base_url": exam.base_url}


@app.delete("/api/exams/{exam_id}", status_code=204)
def delete_exam(exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    db.delete(exam)
    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# Link generator
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/generate-links")
def generate_links(base_url: str, start: int = 1, end: int = 100):
    if end - start > 500:
        raise HTTPException(400, "Range too large (max 500 links at once)")
    links = scraper.generate_urls(base_url, start, end)
    return {"links": links, "count": len(links)}


class CookiePayload(BaseModel):
    cookie_string: str


@app.get("/api/normalize-url")
def normalize_exam_url(url: str):
    """Normalize any ExamTopics URL to the canonical exam index format."""
    normalized = scraper.normalize_exam_url(url)
    is_valid = "/exams/" in normalized
    return {"original": url, "normalized": normalized, "is_valid": is_valid}


@app.post("/api/settings/cookies")
def set_cookies(payload: CookiePayload):
    """Save browser cookies so the scraper can access pages 2+ on ExamTopics."""
    scraper.set_cookies(payload.cookie_string)
    return {"message": "Cookies saved and applied"}


@app.get("/api/settings/cookies")
def get_cookie_status():
    from pathlib import Path
    path = Path(__file__).parent / "cookies.txt"
    if path.exists():
        content = path.read_text()
        # Return first 60 chars to confirm without exposing full value
        preview = content[:60] + "…" if len(content) > 60 else content
        return {"configured": True, "preview": preview}
    return {"configured": False}


# ──────────────────────────────────────────────────────────────────────────────
# Scraping
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/scrape")
def start_scrape(
    payload: ScrapeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")

    urls = scraper.generate_urls(payload.base_url, payload.start, payload.end)
    _scrape_status[payload.exam_id] = {
        "status": "running",
        "progress": 0,
        "total": len(urls),
        "saved": 0,
        "errors": 0,
        "last_url": "",
    }

    background_tasks.add_task(_scrape_worker, payload.exam_id, urls)
    return {"message": "Scraping started", "total_urls": len(urls)}


@app.get("/api/scrape/debug")
def debug_scrape(url: str):
    """
    Scrapes a single URL and returns the raw HTML snippet, detected CSS
    classes, and the parsed result — useful to verify selectors are correct.
    The full HTML is also saved to /tmp/debug_*.html
    """
    return scraper.debug_scrape(url)


def _scrape_worker(exam_id: int, urls: list[str]):
    # Use SessionLocal() directly — avoids the generator/finally issue
    # that occurs when calling next(get_db()) inside a background task.
    db = SessionLocal()
    try:
        for idx, url in enumerate(urls, start=1):
            _scrape_status[exam_id]["progress"] = idx
            _scrape_status[exam_id]["last_url"] = url

            result = scraper.scrape_question(url)
            if result and result.get("question_text"):
                # Derive question number from URL when possible, else use index
                q_num = _question_number_from_url(url) or idx

                existing = db.query(Question).filter(Question.url == url).first()
                if not existing:
                    q = Question(
                        exam_id=exam_id,
                        question_number=q_num,
                        url=result["url"],
                        question_text=result["question_text"],
                        options=result["options"],
                        correct_answer=result["correct_answer"],
                        topic=result["topic"],
                        comments=result.get("comments", []),
                    )
                    db.add(q)
                    db.commit()
                    _scrape_status[exam_id]["saved"] += 1
            else:
                _scrape_status[exam_id]["errors"] += 1

        _scrape_status[exam_id]["status"] = "completed"

    except Exception as exc:
        _scrape_status[exam_id]["status"] = "failed"
        _scrape_status[exam_id]["error"] = str(exc)
        print(f"[worker] FATAL — exam {exam_id} — {exc}")

    finally:
        db.close()


def _question_number_from_url(url: str) -> Optional[int]:
    """Extract trailing integer from URL, e.g. …question-42 → 42."""
    import re
    m = re.search(r"(\d+)\s*$", url.rstrip("/"))
    return int(m.group(1)) if m else None


@app.get("/api/scrape/status/{exam_id}")
def scrape_status(exam_id: int):
    return _scrape_status.get(exam_id, {"status": "not_started"})


@app.post("/api/scrape-index")
def start_index_scrape(
    payload: IndexScrapeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Scrapes the ExamTopics exam index pages to discover and save questions.
    This is the correct approach — individual discussion URLs have unpredictable IDs.
    """
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")

    total_pages = payload.end_page - payload.start_page + 1
    _scrape_status[payload.exam_id] = {
        "status": "running",
        "progress": 0,
        "total": total_pages,
        "saved": 0,
        "errors": 0,
        "last_url": "",
        "auth_required": False,
    }

    background_tasks.add_task(
        _index_scrape_worker,
        payload.exam_id,
        payload.exam_url,
        payload.start_page,
        payload.end_page,
    )
    return {"message": "Index scraping started", "total_pages": total_pages}


def _index_scrape_worker(exam_id: int, exam_url: str, start_page: int, end_page: int):
    db = SessionLocal()
    try:
        def on_progress(done, total, saved, error=None):
            _scrape_status[exam_id]["progress"] = done
            _scrape_status[exam_id]["saved"] = saved
            _scrape_status[exam_id]["last_url"] = f"Página {start_page + done - 1}"
            if error == "auth_required":
                _scrape_status[exam_id]["auth_required"] = True

        results = scraper.scrape_exam_index(
            exam_url, start_page, end_page,
            progress_callback=on_progress,
            fetch_comments=True,
        )

        for q_data in results:
            # Skip if question_number already exists for this exam
            existing = db.query(Question).filter(
                Question.exam_id == exam_id,
                Question.question_number == q_data["question_number"],
            ).first()
            if existing:
                continue

            q = Question(
                exam_id=exam_id,
                question_number=q_data["question_number"],
                url=q_data.get("url"),
                exam_question_id=q_data.get("exam_question_id"),
                question_text=q_data["question_text"],
                options=q_data["options"],
                correct_answer=q_data["correct_answer"],
                topic=q_data["topic"],
                comments=q_data.get("comments", []),
            )
            db.add(q)

        db.commit()
        _scrape_status[exam_id]["status"] = "completed"
        _scrape_status[exam_id]["saved"] = len(results)

    except Exception as exc:
        _scrape_status[exam_id]["status"] = "failed"
        _scrape_status[exam_id]["error"] = str(exc)
        print(f"[index-worker] FATAL — {exc}")
    finally:
        db.close()


@app.post("/api/scrape-all")
def start_all_scrape(
    payload: AllScrapeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Fetches ALL questions using AJAX + discussion pages — no authentication needed.
    Phase 1: exam index page 1 (free).
    Phase 2: per-question AJAX + individual discussion pages (also free).
    """
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")

    _scrape_status[payload.exam_id] = {
        "status": "running",
        "progress": 0,
        "total": payload.total_questions,
        "saved": 0,
        "errors": 0,
        "last_url": "",
        "auth_required": False,
    }

    background_tasks.add_task(
        _all_scrape_worker,
        payload.exam_id,
        payload.exam_url,
        payload.total_questions,
    )
    return {"message": "Full scraping started", "total_questions": payload.total_questions}


def _all_scrape_worker(exam_id: int, exam_url: str, total_questions: int):
    db = SessionLocal()
    try:
        def on_progress(done, total, saved, error=None):
            _scrape_status[exam_id]["progress"] = done
            _scrape_status[exam_id]["saved"] = saved        # questions fetched so far
            _scrape_status[exam_id]["last_url"] = f"Q{done}"

        results = scraper.scrape_all_via_ajax(exam_url, total_questions, on_progress)

        # Persist to DB — skip already-existing question numbers
        new_count      = 0
        skipped_count  = 0
        for q_data in results:
            existing = db.query(Question).filter(
                Question.exam_id == exam_id,
                Question.question_number == q_data["question_number"],
            ).first()
            if existing:
                skipped_count += 1
                continue
            db.add(Question(
                exam_id=exam_id,
                question_number=q_data["question_number"],
                url=q_data.get("url"),
                exam_question_id=q_data.get("exam_question_id"),
                question_text=q_data["question_text"],
                options=q_data["options"],
                correct_answer=q_data["correct_answer"],
                topic=q_data["topic"],
                comments=q_data.get("comments", []),
            ))
            new_count += 1

        db.commit()

        total_in_db = db.query(Question).filter(Question.exam_id == exam_id).count()
        _scrape_status[exam_id]["status"]   = "completed"
        _scrape_status[exam_id]["saved"]    = len(results)   # total fetched this run
        _scrape_status[exam_id]["new"]      = new_count       # newly inserted
        _scrape_status[exam_id]["skipped"]  = skipped_count   # already existed
        _scrape_status[exam_id]["total_db"] = total_in_db     # grand total in DB

        print(f"[all-worker] Done — fetched={len(results)} new={new_count} "
              f"skipped={skipped_count} total_in_db={total_in_db}")

    except Exception as exc:
        _scrape_status[exam_id]["status"] = "failed"
        _scrape_status[exam_id]["error"]  = str(exc)
        print(f"[all-worker] FATAL — {exc}")
    finally:
        db.close()


@app.delete("/api/exams/{exam_id}/questions", status_code=204)
def clear_exam_questions(exam_id: int, db: Session = Depends(get_db)):
    db.query(Question).filter(Question.exam_id == exam_id).delete()
    db.commit()


@app.get("/api/exams/{exam_id}/missing-questions")
def get_missing_questions(exam_id: int, total: int, db: Session = Depends(get_db)):
    """Return question numbers that are missing from 1..total."""
    existing = {
        q.question_number
        for q in db.query(Question.question_number).filter(Question.exam_id == exam_id).all()
    }
    missing = [n for n in range(1, total + 1) if n not in existing]
    return {"exam_id": exam_id, "total": total, "missing": missing, "count": len(missing)}


# ── Comments fetch ─────────────────────────────────────────────────────────────

_comments_status: dict[int, dict] = {}


@app.post("/api/fetch-comments/{exam_id}")
def start_fetch_comments(
    exam_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    For each question with exam_question_id set, fetch comments from the
    ExamTopics AJAX endpoint and save them to the DB.
    """
    questions = (
        db.query(Question)
        .filter(Question.exam_id == exam_id, Question.exam_question_id.isnot(None))
        .all()
    )
    if not questions:
        raise HTTPException(400, "No questions with exam_question_id found. Re-scrape the index first.")

    _comments_status[exam_id] = {
        "status": "running", "progress": 0,
        "total": len(questions), "saved": 0, "errors": 0,
    }
    background_tasks.add_task(_fetch_comments_worker, exam_id, [q.id for q in questions])
    return {"message": "Comment fetching started", "total": len(questions)}


@app.get("/api/fetch-comments/status/{exam_id}")
def fetch_comments_status(exam_id: int):
    return _comments_status.get(exam_id, {"status": "not_started"})


def _fetch_comments_worker(exam_id: int, question_ids: list[int]):
    db = SessionLocal()
    try:
        for i, qid in enumerate(question_ids, start=1):
            _comments_status[exam_id]["progress"] = i
            q = db.get(Question, qid)
            if not q or not q.exam_question_id:
                continue
            comments = scraper.fetch_question_comments(q.exam_question_id)
            q.comments = comments
            db.commit()
            if comments:
                _comments_status[exam_id]["saved"] += 1
            else:
                _comments_status[exam_id]["errors"] += 1

        _comments_status[exam_id]["status"] = "completed"
    except Exception as exc:
        _comments_status[exam_id]["status"] = "failed"
        _comments_status[exam_id]["error"] = str(exc)
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Questions
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/questions")
def list_questions(exam_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Question)
    if exam_id is not None:
        q = q.filter(Question.exam_id == exam_id)
    questions = q.order_by(Question.question_number).all()
    return [
        {
            "id": qu.id,
            "exam_id": qu.exam_id,
            "question_number": qu.question_number,
            "url": qu.url,
            "question_text": qu.question_text,
            "options": qu.options,
            "correct_answer": qu.correct_answer,
            "topic": qu.topic,
        }
        for qu in questions
    ]


@app.post("/api/questions", status_code=201)
def create_question(payload: QuestionCreate, db: Session = Depends(get_db)):
    exam = db.query(Exam).filter(Exam.id == payload.exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")

    q = Question(**payload.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    return {"id": q.id, "question_number": q.question_number}


@app.put("/api/questions/{question_id}")
def update_question(question_id: int, payload: QuestionUpdate, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(q, field, value)

    db.commit()
    db.refresh(q)
    return {"id": q.id}


@app.delete("/api/questions/{question_id}", status_code=204)
def delete_question(question_id: int, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")
    db.delete(q)
    db.commit()


# ──────────────────────────────────────────────────────────────────────────────
# Simulator sessions
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/api/sessions", status_code=201)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    all_q = db.query(Question).filter(Question.exam_id == payload.exam_id).all()
    # Only include questions that have at least one answer option
    questions = [q for q in all_q if q.options and len(q.options) > 0]

    if payload.start_from is not None:
        # Sequential mode: start from a specific question_number, ordered
        questions = sorted(
            [q for q in questions if q.question_number >= payload.start_from],
            key=lambda q: q.question_number,
        )

    if len(questions) < payload.question_count:
        raise HTTPException(
            400,
            f"Not enough questions. Available: {len(questions)}, requested: {payload.question_count}",
        )

    if payload.start_from is not None:
        selected = questions[:payload.question_count]
    else:
        selected = random.sample(questions, payload.question_count)

    session = ExamSession(exam_id=payload.exam_id, total_questions=payload.question_count)
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "total": payload.question_count,
        "questions": [
            {
                "id": q.id,
                "question_number": q.question_number,
                "question_text": q.question_text,
                "options": q.options,
                "topic": q.topic,
                "correct_answer": q.correct_answer,
                "comments": q.comments or [],
            }
            for q in selected
        ],
    }


@app.post("/api/sessions/{session_id}/submit")
def submit_session(
    session_id: int,
    payload: BulkAnswerSubmit,
    db: Session = Depends(get_db),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    if session.completed_at:
        raise HTTPException(400, "Session already submitted")

    results = []
    correct_count = 0

    for ans in payload.answers:
        question = db.query(Question).filter(Question.id == ans.question_id).first()
        if not question:
            continue

        is_correct = question.correct_answer.upper() == ans.user_answer.upper()
        correct_count += int(is_correct)

        db_ans = SessionAnswer(
            session_id=session_id,
            question_id=ans.question_id,
            user_answer=ans.user_answer.upper(),
            is_correct=is_correct,
        )
        db.add(db_ans)

        results.append(
            {
                "question_id": ans.question_id,
                "user_answer": ans.user_answer.upper(),
                "correct_answer": question.correct_answer,
                "is_correct": is_correct,
                "question_text": question.question_text,
                "options": question.options,
                "topic": question.topic,
                "comments": question.comments or [],
            }
        )

    total = len(payload.answers)
    score = round((correct_count / total) * 100, 2) if total else 0

    session.score = score
    session.completed_at = datetime.utcnow()
    db.commit()

    return {
        "session_id": session_id,
        "score": score,
        "correct": correct_count,
        "total": total,
        "results": results,
    }


@app.get("/api/sessions")
def list_sessions(db: Session = Depends(get_db)):
    sessions = (
        db.query(ExamSession)
        .filter(ExamSession.completed_at.isnot(None))
        .order_by(ExamSession.started_at.desc())
        .all()
    )
    exam_names = {e.id: e.name for e in db.query(Exam).all()}
    return [
        {
            "id": s.id,
            "exam_id": s.exam_id,
            "exam_name": exam_names.get(s.exam_id, "—"),
            "score": s.score,
            "total_questions": s.total_questions,
            "started_at": s.started_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in sessions
    ]


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "id": session.id,
        "exam_id": session.exam_id,
        "score": session.score,
        "total_questions": session.total_questions,
        "started_at": session.started_at.isoformat(),
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
    }


@app.get("/api/sessions/{session_id}/results")
def get_session_results(session_id: int, db: Session = Depends(get_db)):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    if not session.completed_at:
        raise HTTPException(400, "Session not completed yet")

    exam_name = session.exam.name if session.exam else "—"
    results = []
    for ans in sorted(session.answers, key=lambda a: a.question.question_number if a.question else 0):
        q = ans.question
        if not q:
            continue
        results.append({
            "question_id": q.id,
            "question_number": q.question_number,
            "question_text": q.question_text,
            "options": q.options,
            "user_answer": ans.user_answer,
            "correct_answer": q.correct_answer,
            "is_correct": ans.is_correct,
            "topic": q.topic,
            "comments": q.comments or [],
        })

    return {
        "session_id": session_id,
        "exam_id": session.exam_id,
        "exam_name": exam_name,
        "score": session.score,
        "correct": sum(1 for r in results if r["is_correct"]),
        "total": session.total_questions,
        "started_at": session.started_at.isoformat(),
        "completed_at": session.completed_at.isoformat(),
        "results": results,
    }


class AdminVerify(BaseModel):
    password: str


@app.post("/api/admin/verify")
def admin_verify(payload: AdminVerify):
    if payload.password == ADMIN_PASSWORD:
        return {"ok": True}
    raise HTTPException(401, "Senha incorreta")


# ──────────────────────────────────────────────────────────────────────────────
# Dashboard
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
def dashboard_global(db: Session = Depends(get_db)):
    return _build_dashboard(db, exam_id=None)


@app.get("/api/dashboard/{exam_id}")
def dashboard_exam(exam_id: int, db: Session = Depends(get_db)):
    return _build_dashboard(db, exam_id=exam_id)


def _build_dashboard(db: Session, exam_id: Optional[int]):
    q = db.query(ExamSession).filter(ExamSession.completed_at.isnot(None))
    if exam_id is not None:
        q = q.filter(ExamSession.exam_id == exam_id)
    sessions = q.order_by(ExamSession.started_at.desc()).all()

    scores = [s.score for s in sessions if s.score is not None]

    # Per-topic stats
    topic_stats: dict[str, dict] = {}
    for session in sessions:
        for ans in session.answers:
            topic = (ans.question.topic or "General") if ans.question else "General"
            stats = topic_stats.setdefault(topic, {"correct": 0, "total": 0})
            stats["total"] += 1
            if ans.is_correct:
                stats["correct"] += 1

    topic_performance = {
        t: {
            "correct": s["correct"],
            "total": s["total"],
            "percentage": round(s["correct"] / s["total"] * 100, 1),
        }
        for t, s in topic_stats.items()
    }

    history = [
        {
            "id": s.id,
            "exam_id": s.exam_id,
            "score": s.score,
            "total_questions": s.total_questions,
            "started_at": s.started_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in sessions
    ]

    return {
        "total_sessions": len(sessions),
        "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
        "best_score": round(max(scores), 1) if scores else 0,
        "worst_score": round(min(scores), 1) if scores else 0,
        "topic_performance": topic_performance,
        "history": history,
    }
