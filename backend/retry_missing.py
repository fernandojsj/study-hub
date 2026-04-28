"""
Standalone script to retry missing questions for Exam 6 (AWS ML Associate)
and scrape Exam 7 (GCP Cloud Engineer Associate) from scratch.

Run from the backend directory:
  python retry_missing.py
"""

import json
import sys
import time
import random
import sqlite3
from pathlib import Path
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from scraper import ExamTopicsScraper

DB_PATH = Path(__file__).parent / "study_hub.db"

# ── Exam 6: AWS ML Associate ──────────────────────────────────────────────────
EXAM6_ID  = 6
EXAM6_URL = "https://www.examtopics.com/exams/amazon/aws-certified-machine-learning-engineer-associate-mla/"

# ── Exam 7: GCP Cloud Engineer Associate ─────────────────────────────────────
EXAM7_ID  = 7
EXAM7_URL = "https://www.examtopics.com/exams/google/associate-cloud-engineer/"
EXAM7_TOTAL = 324


def db_connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_existing_nums(conn, exam_id: int) -> set[int]:
    cur = conn.execute("SELECT question_number FROM questions WHERE exam_id=?", (exam_id,))
    return {r[0] for r in cur.fetchall()}


def get_exam_base_data_id(conn, exam_id: int) -> int | None:
    """Get base data_id from the first question of the exam."""
    cur = conn.execute(
        "SELECT exam_question_id, question_number FROM questions "
        "WHERE exam_id=? AND exam_question_id IS NOT NULL ORDER BY question_number LIMIT 1",
        (exam_id,)
    )
    row = cur.fetchone()
    if row and row["exam_question_id"] and row["question_number"]:
        return row["exam_question_id"] - (row["question_number"] - 1)
    return None


def upsert_question(conn, exam_id: int, q: dict) -> bool:
    """Insert question, skip if already exists. Returns True if inserted."""
    existing = conn.execute(
        "SELECT id FROM questions WHERE exam_id=? AND question_number=?",
        (exam_id, q["question_number"])
    ).fetchone()
    if existing:
        return False

    conn.execute(
        """INSERT INTO questions
           (exam_id, question_number, url, question_text, options,
            correct_answer, topic, comments, exam_question_id)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            exam_id,
            q["question_number"],
            q.get("url"),
            q["question_text"],
            json.dumps(q.get("options", {})),
            q.get("correct_answer", "A"),
            q.get("topic", "General"),
            json.dumps(q.get("comments", [])),
            q.get("exam_question_id"),
        )
    )
    conn.commit()
    return True


def retry_exam6_missing(scraper: ExamTopicsScraper):
    conn = db_connect()
    existing = get_existing_nums(conn, EXAM6_ID)
    base_data_id = get_exam_base_data_id(conn, EXAM6_ID)

    print(f"\n=== Exam 6 (AWS ML Associate) ===")
    print(f"Existing questions: {len(existing)}")
    print(f"Base data_id: {base_data_id}")

    if base_data_id is None:
        print("ERROR: Cannot determine base data_id for Exam 6")
        conn.close()
        return

    # Determine max question number
    cur = conn.execute("SELECT MAX(question_number) FROM questions WHERE exam_id=?", (EXAM6_ID,))
    max_q = cur.fetchone()[0] or 0
    print(f"Max question number in DB: {max_q}")

    # Find gaps up to max_q
    missing = sorted(set(range(1, max_q + 1)) - existing)
    print(f"Missing ({len(missing)}): {missing[:20]}{'...' if len(missing) > 20 else ''}")

    # Also normalize Exam 6 URL in case it's still a discussion URL
    cur = conn.execute("SELECT base_url FROM exams WHERE id=?", (EXAM6_ID,))
    row = cur.fetchone()
    if row:
        current_url = row[0]
        normalized = ExamTopicsScraper.normalize_exam_url(current_url)
        if normalized != current_url:
            conn.execute("UPDATE exams SET base_url=? WHERE id=?", (normalized, EXAM6_ID))
            conn.commit()
            print(f"Fixed Exam 6 URL: {current_url} → {normalized}")

    inserted = 0
    failed = []

    normalized_exam_url = ExamTopicsScraper.normalize_exam_url(EXAM6_URL)
    parts = [p for p in normalized_exam_url.rstrip("/").split("/") if p]
    vendor    = parts[-2] if len(parts) >= 2 else "amazon"
    exam_slug = parts[-1] if parts else "aws-certified-machine-learning-engineer-associate-mla"

    for q_num in missing:
        data_id = base_data_id + (q_num - 1)
        print(f"\n[Exam6] Retrying Q{q_num} (data_id={data_id})...")

        # Use longer delays to avoid 503
        delay = random.uniform(5.0, 10.0)
        print(f"  Sleeping {delay:.1f}s...")
        time.sleep(delay)

        try:
            ajax_url = f"https://www.examtopics.com/ajax/discussion/exam-question/{data_id}"
            ajax_r = scraper.session.get(ajax_url, timeout=30)

            if ajax_r.status_code == 503:
                print(f"  503 — rate limited, sleeping 30s...")
                time.sleep(30)
                ajax_r = scraper.session.get(ajax_url, timeout=30)

            if ajax_r.status_code != 200:
                print(f"  AJAX HTTP {ajax_r.status_code} — skipping")
                failed.append(q_num)
                continue

            ajax_soup = BeautifulSoup(ajax_r.text, "lxml")
            comments = scraper._extract_comments(ajax_soup)

            discussion_url = None
            for a_tag in ajax_soup.find_all("a", href=True):
                href = a_tag["href"]
                if "/discussions/" in href and "/view/" in href:
                    discussion_url = (
                        f"https://www.examtopics.com{href}"
                        if href.startswith("/") else href
                    )
                    break

            disc_el = ajax_soup.find(attrs={"data-discussion-id": True})
            discussion_id = disc_el["data-discussion-id"] if disc_el else None

            if not discussion_url and discussion_id:
                discussion_url = (
                    f"https://www.examtopics.com/discussions/{vendor}/view/"
                    f"{discussion_id}-exam-{exam_slug}-topic-1-question-{q_num}/"
                )

            if not discussion_url:
                print(f"  No discussion URL for Q{q_num} — skipping")
                failed.append(q_num)
                continue

            time.sleep(random.uniform(4.0, 7.0))
            disc_r = scraper.session.get(discussion_url, timeout=30)

            if disc_r.status_code == 503:
                print(f"  Discussion 503 — sleeping 30s...")
                time.sleep(30)
                disc_r = scraper.session.get(discussion_url, timeout=30)

            if disc_r.status_code != 200:
                print(f"  Discussion HTTP {disc_r.status_code} — skipping")
                failed.append(q_num)
                continue

            if scraper._is_blocked(disc_r.text):
                print(f"  Blocked — skipping")
                failed.append(q_num)
                continue

            disc_soup = BeautifulSoup(disc_r.text, "lxml")
            question_text  = scraper._extract_question_text(disc_soup)
            options        = scraper._extract_options(disc_soup)
            correct_answer = scraper._extract_correct_answer(disc_soup, options)
            topic          = scraper._extract_topic(disc_soup, discussion_url)

            if not comments:
                comments = scraper._extract_comments(disc_soup)

            if not question_text:
                print(f"  No question text for Q{q_num} — skipping")
                failed.append(q_num)
                continue

            # Allow questions without MCQ options (HOTSPOT, DRAG DROP, FILL BLANK)
            if not options:
                print(f"  WARNING: Q{q_num} has no options (special question type) — saving anyway")

            q_data = {
                "question_number": q_num,
                "url": discussion_url,
                "exam_question_id": data_id,
                "question_text": question_text,
                "options": options,
                "correct_answer": correct_answer,
                "topic": topic,
                "comments": comments,
            }

            if upsert_question(conn, EXAM6_ID, q_data):
                inserted += 1
                print(f"  OK: {question_text[:70]}...")
            else:
                print(f"  Already exists (skipped)")

        except Exception as exc:
            print(f"  ERROR: {exc}")
            failed.append(q_num)

    print(f"\n=== Exam 6 Summary ===")
    print(f"Inserted: {inserted}")
    print(f"Failed ({len(failed)}): {failed}")
    conn.close()


def scrape_exam7(scraper: ExamTopicsScraper):
    conn = db_connect()
    existing = get_existing_nums(conn, EXAM7_ID)
    base_data_id = get_exam_base_data_id(conn, EXAM7_ID)

    print(f"\n=== Exam 7 (GCP Cloud Engineer Associate) ===")
    print(f"Existing questions: {len(existing)}")
    print(f"Target: {EXAM7_TOTAL} questions")
    print(f"Base data_id: {base_data_id}")

    # Update exam URL
    conn.execute("UPDATE exams SET base_url=? WHERE id=?", (EXAM7_URL, EXAM7_ID))
    conn.commit()

    # If we have most of the first 10 questions, continue via AJAX from where we left off
    if base_data_id and len(existing) > 10:
        missing = sorted(set(range(1, EXAM7_TOTAL + 1)) - existing)
        print(f"Continuing from missing ({len(missing)}): {missing[:10]}...")
        inserted = 0
        failed = []

        vendor    = "google"
        exam_slug = "associate-cloud-engineer"

        for q_num in missing:
            data_id = base_data_id + (q_num - 1)
            print(f"[Exam7] Q{q_num} (data_id={data_id})", flush=True)

            delay = random.uniform(4.0, 8.0)
            time.sleep(delay)

            try:
                ajax_url = f"https://www.examtopics.com/ajax/discussion/exam-question/{data_id}"
                ajax_r = scraper.session.get(ajax_url, timeout=30)

                if ajax_r.status_code == 503:
                    print(f"  503 — sleeping 30s...")
                    time.sleep(30)
                    ajax_r = scraper.session.get(ajax_url, timeout=30)

                if ajax_r.status_code != 200:
                    print(f"  AJAX HTTP {ajax_r.status_code}")
                    failed.append(q_num)
                    continue

                ajax_soup = BeautifulSoup(ajax_r.text, "lxml")
                comments = scraper._extract_comments(ajax_soup)

                discussion_url = None
                for a_tag in ajax_soup.find_all("a", href=True):
                    href = a_tag["href"]
                    if "/discussions/" in href and "/view/" in href:
                        discussion_url = (
                            f"https://www.examtopics.com{href}"
                            if href.startswith("/") else href
                        )
                        break

                disc_el = ajax_soup.find(attrs={"data-discussion-id": True})
                discussion_id = disc_el["data-discussion-id"] if disc_el else None

                if not discussion_url and discussion_id:
                    discussion_url = (
                        f"https://www.examtopics.com/discussions/{vendor}/view/"
                        f"{discussion_id}-exam-{exam_slug}-topic-1-question-{q_num}/"
                    )

                if not discussion_url:
                    print(f"  No discussion URL")
                    failed.append(q_num)
                    continue

                time.sleep(random.uniform(3.0, 6.0))
                disc_r = scraper.session.get(discussion_url, timeout=30)

                if disc_r.status_code == 503:
                    print(f"  Discussion 503 — sleeping 30s...")
                    time.sleep(30)
                    disc_r = scraper.session.get(discussion_url, timeout=30)

                if disc_r.status_code != 200 or scraper._is_blocked(disc_r.text):
                    print(f"  Discussion HTTP {disc_r.status_code}")
                    failed.append(q_num)
                    continue

                disc_soup = BeautifulSoup(disc_r.text, "lxml")
                question_text  = scraper._extract_question_text(disc_soup)
                options        = scraper._extract_options(disc_soup)
                correct_answer = scraper._extract_correct_answer(disc_soup, options)
                topic          = scraper._extract_topic(disc_soup, discussion_url)

                if not comments:
                    comments = scraper._extract_comments(disc_soup)

                if not question_text:
                    print(f"  No question text")
                    failed.append(q_num)
                    continue

                q_data = {
                    "question_number": q_num,
                    "url": discussion_url,
                    "exam_question_id": data_id,
                    "question_text": question_text,
                    "options": options,
                    "correct_answer": correct_answer,
                    "topic": topic,
                    "comments": comments,
                }

                if upsert_question(conn, EXAM7_ID, q_data):
                    inserted += 1
                    print(f"  OK: {question_text[:70]}", flush=True)

            except Exception as exc:
                print(f"  ERROR: {exc}")
                failed.append(q_num)

        cur = conn.execute("SELECT COUNT(*) FROM questions WHERE exam_id=?", (EXAM7_ID,))
        total_db = cur.fetchone()[0]
        print(f"\n=== Exam 7 Summary ===")
        print(f"Inserted: {inserted} | Failed ({len(failed)}): {failed[:20]}")
        print(f"Total in DB: {total_db}/{EXAM7_TOTAL}")

    else:
        # Full scrape from scratch
        def progress(current, total, saved, status):
            pct = int(current / total * 100) if total else 0
            print(f"  Progress: {current}/{total} ({pct}%) | saved={saved}", flush=True)

        print("Starting full AJAX scrape for Exam 7...")
        results = scraper.scrape_all_via_ajax(
            exam_url=EXAM7_URL,
            total_questions=EXAM7_TOTAL,
            progress_callback=progress,
        )

        inserted = 0
        for q in results:
            if q["question_number"] in existing:
                continue
            if upsert_question(conn, EXAM7_ID, q):
                inserted += 1

        cur = conn.execute("SELECT COUNT(*) FROM questions WHERE exam_id=?", (EXAM7_ID,))
        total_db = cur.fetchone()[0]
        print(f"\n=== Exam 7 Summary ===")
        print(f"Inserted this run: {inserted}")
        print(f"Total in DB: {total_db}/{EXAM7_TOTAL}")

    conn.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--exam", choices=["6", "7", "both"], default="both",
                        help="Which exam to process (default: both)")
    args = parser.parse_args()

    s = ExamTopicsScraper()

    if args.exam in ("6", "both"):
        retry_exam6_missing(s)

    if args.exam in ("7", "both"):
        scrape_exam7(s)
