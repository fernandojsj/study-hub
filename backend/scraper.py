"""
ExamTopics scraper.

Strategy:
  1. cloudscraper handles Cloudflare JS-challenge bypass.
  2. Polite random delays avoid rate-limiting.
  3. Multiple selector fallbacks handle ExamTopics layout variations.
  4. debug_scrape() dumps raw HTML to disk for manual inspection.
"""

import json
import re
import time
import random
from pathlib import Path
from typing import Optional

import cloudscraper
from bs4 import BeautifulSoup


COOKIES_FILE = Path(__file__).parent / "cookies.txt"


class ExamTopicsScraper:
    def __init__(self):
        self.session = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "desktop": True}
        )
        self.session.headers.update({
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Cache-Control": "max-age=0",
        })
        self._load_cookies()

    def set_cookies(self, cookie_string: str):
        """
        Accept the raw Cookie header value copied from browser DevTools.
        Parses key=value pairs separated by '; ' and injects into the session.
        """
        COOKIES_FILE.write_text(cookie_string.strip(), encoding="utf-8")
        self._apply_cookies(cookie_string)

    def _load_cookies(self):
        if COOKIES_FILE.exists():
            self._apply_cookies(COOKIES_FILE.read_text(encoding="utf-8"))
            print("[scraper] Cookies loaded from cookies.txt")

    def _apply_cookies(self, cookie_string: str):
        for part in cookie_string.split(";"):
            part = part.strip()
            if "=" in part:
                name, _, value = part.partition("=")
                self.session.cookies.set(name.strip(), value.strip(), domain="www.examtopics.com")

    def _is_validation_page(self, html: str) -> bool:
        """ExamTopics shows a Validation page when not authenticated or rate-limited."""
        blocked = "Enter Captcha" in html or (
            "Validation" in html and "exam-question-card" not in html
        )
        return blocked and "exam-question-card" not in html

    @staticmethod
    def normalize_exam_url(url: str) -> str:
        """
        Accepts any ExamTopics URL and returns the canonical exam index URL.

        Handles:
          • Already correct:  /exams/{vendor}/{slug}/
          • With view suffix: /exams/{vendor}/{slug}/view/3/
          • Discussion URL:   /discussions/{vendor}/view/{id}-exam-{slug}-topic-{n}-question-{n}/
          • Single question:  /discussions/{vendor}/view/{id}-.../ (any form with exam- slug)
        """
        url = url.strip()

        # Already correct exam index URL (possibly with /view/N/)
        m = re.search(r'examtopics\.com/exams/([^/]+)/([^/]+)', url)
        if m:
            return f"https://www.examtopics.com/exams/{m.group(1)}/{m.group(2)}/"

        # Discussion URL with topic suffix:
        # /discussions/google/view/7083-exam-professional-cloud-architect-topic-1-question-1/
        m = re.search(r'examtopics\.com/discussions/([^/]+)/view/\d+-exam-(.*?)-topic-', url)
        if m:
            vendor    = m.group(1)
            exam_slug = m.group(2)
            return f"https://www.examtopics.com/exams/{vendor}/{exam_slug}/"

        # Discussion URL without topic suffix (slug ends before /):
        # /discussions/amazon/view/152098-exam-aws-certified-machine-learning-engineer-associate-mla/
        m = re.search(r'examtopics\.com/discussions/([^/]+)/view/\d+-exam-([^/]+?)/?$', url)
        if m:
            vendor    = m.group(1)
            exam_slug = m.group(2).rstrip("/")
            return f"https://www.examtopics.com/exams/{vendor}/{exam_slug}/"

        # Fallback: return as-is and let the caller deal with it
        return url

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def generate_urls(self, base_url: str, start: int, end: int) -> list[str]:
        base = base_url.rstrip("/")
        return [f"{base}{i}" for i in range(start, end + 1)]

    # ------------------------------------------------------------------ #
    # Exam-index scraper (preferred — avoids per-question HTTP round trips)
    # ------------------------------------------------------------------ #

    def scrape_exam_index(
        self,
        exam_url: str,
        start_page: int = 1,
        end_page: int = 10,
        progress_callback=None,
        fetch_comments: bool = True,
    ) -> list[dict]:
        """
        Scrapes ExamTopics exam index pages.
        Requires authenticated cookies for page 2+ (set via set_cookies()).
        When fetch_comments=True, also fetches discussion comments per question via AJAX.
        """
        exam_url = self.normalize_exam_url(exam_url)
        base = exam_url.rstrip("/")
        results: list[dict] = []
        total_pages = end_page - start_page + 1

        for page_num in range(start_page, end_page + 1):
            url = f"{base}/view/{page_num}/"
            print(f"[index-scraper] page {page_num}/{end_page}  →  {url}")
            time.sleep(random.uniform(1.5, 3.0))

            try:
                r = self.session.get(url, timeout=30)

                if r.status_code == 404:
                    print("[index-scraper] 404 — no more pages")
                    break
                if r.status_code != 200:
                    print(f"[index-scraper] HTTP {r.status_code} — skipping page {page_num}")
                    continue
                if self._is_blocked(r.text):
                    print(f"[index-scraper] Cloudflare block on page {page_num}")
                    continue
                if self._is_validation_page(r.text):
                    print(f"[index-scraper] VALIDATION PAGE on {page_num} — cookies ausentes ou expirados")
                    if progress_callback:
                        progress_callback(
                            page_num - start_page + 1, total_pages,
                            len(results), "auth_required"
                        )
                    break

                soup = BeautifulSoup(r.text, "lxml")
                cards = soup.find_all(class_="exam-question-card")

                if not cards:
                    print(f"[index-scraper] No cards on page {page_num} — stopping")
                    break

                for card in cards:
                    q = self._parse_index_card(card)
                    if not q:
                        continue
                    if fetch_comments and q.get("exam_question_id"):
                        q["comments"] = self.fetch_question_comments(q["exam_question_id"])
                    results.append(q)

                if progress_callback:
                    progress_callback(page_num - start_page + 1, total_pages, len(results), None)

            except Exception as exc:
                print(f"[index-scraper] ERROR page {page_num}: {exc}")

        print(f"[index-scraper] Done — {len(results)} questions extracted")
        return results

    def _parse_index_card(self, card) -> Optional[dict]:
        """Parse one exam-question-card from the index page."""
        # ── Question number ──────────────────────────────────────────────
        header = card.find(class_="card-header")
        q_num = 0
        if header:
            m = re.search(r"#(\d+)", header.get_text())
            if m:
                q_num = int(m.group(1))

        # ── ExamTopics internal question id (data-id) ────────────────────
        data_div = card.find(attrs={"data-id": True})
        exam_question_id = int(data_div["data-id"]) if data_div else None

        # ── Topic ────────────────────────────────────────────────────────
        topic_el = card.find(class_="question-title-topic")
        topic = topic_el.get_text(strip=True) if topic_el else "General"

        # ── Question text ────────────────────────────────────────────────
        q_text_el = card.find("p", class_="card-text")
        if not q_text_el:
            return None
        question_text = q_text_el.get_text(" ", strip=True)
        if len(question_text) < 10:
            return None

        # ── Options  (data-choice-letter="A/B/C/D") ──────────────────────
        options: dict[str, str] = {}
        for item in card.find_all(class_="multi-choice-item"):
            letter_span = item.find(attrs={"data-choice-letter": True})
            if letter_span:
                letter = letter_span["data-choice-letter"].upper()
                # Remove the letter span text from option text
                letter_span.extract()
                text = item.get_text(" ", strip=True)
                text = re.sub(r"^[A-F][.)]\s*", "", text).strip()
            else:
                # Fallback: derive letter from order
                letter = chr(65 + len(options))
                text = item.get_text(" ", strip=True)
                text = re.sub(r"^[A-F][.)]\s*", "", text).strip()
            if text:
                options[letter] = text

        if not options:
            return None

        # ── Correct answer (embedded JSON script) ────────────────────────
        correct_answer = self._parse_voted_answer(card, options)

        return {
            "question_number": q_num,
            "url": None,
            "exam_question_id": exam_question_id,
            "question_text": question_text,
            "options": options,
            "correct_answer": correct_answer,
            "topic": topic,
            "comments": [],
        }

    def _parse_voted_answer(self, card, options: dict[str, str]) -> str:
        """
        The index card embeds a <script> tag with JSON like:
          [{"voted_answers": "D", "vote_count": 72, "is_most_voted": true}]

        Pick the entry with is_most_voted=true and highest vote_count.
        """
        script = card.find("script")
        if script and script.string:
            try:
                data = json.loads(script.string)
                candidates = [e for e in data if e.get("is_most_voted")]
                if candidates:
                    best = max(candidates, key=lambda e: e.get("vote_count", 0))
                    answer_str = best.get("voted_answers", "").strip()
                    # Take first letter only (handles multi-answer like "CDE")
                    m = re.match(r"([A-E])", answer_str)
                    if m:
                        return m.group(1)
            except (json.JSONDecodeError, KeyError):
                pass

        return list(options.keys())[0] if options else "A"

    def fetch_question_comments(self, exam_question_id: int) -> list[dict]:
        """
        Fetch comments from ExamTopics AJAX endpoint using the card's data-id.
        URL: /ajax/discussion/exam-question/{exam_question_id}
        Returns HTML fragment rendered server-side (no JS needed).
        """
        url = f"https://www.examtopics.com/ajax/discussion/exam-question/{exam_question_id}"
        try:
            time.sleep(random.uniform(1.0, 2.5))
            r = self.session.get(url, timeout=30)
            if r.status_code != 200:
                print(f"[comments] HTTP {r.status_code} for id={exam_question_id}")
                return []
            soup = BeautifulSoup(r.text, "lxml")
            return self._extract_comments(soup)
        except Exception as exc:
            print(f"[comments] ERROR id={exam_question_id}: {exc}")
            return []

    def scrape_all_via_ajax(
        self,
        exam_url: str,
        total_questions: int = 100,
        progress_callback=None,
    ) -> list[dict]:
        """
        Fetches ALL questions without authentication:
        1. Scrapes page 1 of the exam index (free) → Q1-Q10 + base data-id.
        2. For Q11+: calls the AJAX discussion endpoint (also free) to get
           data-discussion-id + comments, then fetches the individual discussion
           page to parse the question text, options, and correct answer.
        """
        exam_url = self.normalize_exam_url(exam_url)
        print(f"[ajax-scraper] Normalized URL → {exam_url}")
        base = exam_url.rstrip("/")
        parts = [p for p in base.split("/") if p]
        vendor   = parts[-2] if len(parts) >= 2 else "unknown"
        exam_slug = parts[-1] if parts else "unknown"

        results: list[dict] = []
        base_data_id: Optional[int] = None

        # ── Phase 1: page 1 of index (no auth required) ──────────────────
        page1_url = f"{base}/view/1/"
        print(f"[ajax-scraper] Phase 1: {page1_url}")
        try:
            r = self.session.get(page1_url, timeout=30)
            if r.status_code == 200 and not self._is_blocked(r.text) and not self._is_validation_page(r.text):
                soup = BeautifulSoup(r.text, "lxml")
                for card in soup.find_all(class_="exam-question-card"):
                    q = self._parse_index_card(card)
                    if not q:
                        continue
                    if q.get("exam_question_id"):
                        if base_data_id is None:
                            base_data_id = q["exam_question_id"] - (q["question_number"] - 1)
                        q["comments"] = self.fetch_question_comments(q["exam_question_id"])
                    results.append(q)
            else:
                print(f"[ajax-scraper] Phase 1 failed: HTTP {r.status_code}")
        except Exception as exc:
            print(f"[ajax-scraper] Phase 1 ERROR: {exc}")

        if base_data_id is None:
            for item in results:
                if item.get("exam_question_id") and item.get("question_number"):
                    base_data_id = item["exam_question_id"] - (item["question_number"] - 1)
                    break

        print(f"[ajax-scraper] Page 1: {len(results)} questions | base_data_id={base_data_id}")

        if progress_callback:
            progress_callback(len(results), total_questions, len(results), None)

        if base_data_id is None:
            print("[ajax-scraper] Cannot determine base data-id, stopping after page 1")
            return results

        # ── Phase 2: remaining questions via AJAX + discussion pages ──────
        page1_nums = {item["question_number"] for item in results}

        for q_num in range(1, total_questions + 1):
            if q_num in page1_nums:
                continue

            data_id = base_data_id + (q_num - 1)
            print(f"[ajax-scraper] Q{q_num}: data_id={data_id}")

            try:
                time.sleep(random.uniform(2.0, 4.0))

                # AJAX → discussion_id + comments
                ajax_url = f"https://www.examtopics.com/ajax/discussion/exam-question/{data_id}"
                ajax_r = self.session.get(ajax_url, timeout=30)
                if ajax_r.status_code != 200:
                    print(f"[ajax-scraper] AJAX HTTP {ajax_r.status_code} for Q{q_num}")
                    continue

                ajax_soup = BeautifulSoup(ajax_r.text, "lxml")
                comments = self._extract_comments(ajax_soup)

                disc_el = ajax_soup.find(attrs={"data-discussion-id": True})
                discussion_id = disc_el["data-discussion-id"] if disc_el else None

                # Prefer a direct href link to the discussion page
                discussion_url = None
                for a_tag in ajax_soup.find_all("a", href=True):
                    href = a_tag["href"]
                    if "/discussions/" in href and "/view/" in href:
                        discussion_url = (
                            f"https://www.examtopics.com{href}"
                            if href.startswith("/") else href
                        )
                        break

                # Fallback: construct URL from discussion_id (topic-1 assumption)
                if not discussion_url:
                    if not discussion_id:
                        print(f"[ajax-scraper] No discussion_id for Q{q_num}, skipping")
                        continue
                    discussion_url = (
                        f"https://www.examtopics.com/discussions/{vendor}/view/"
                        f"{discussion_id}-exam-{exam_slug}-topic-1-question-{q_num}/"
                    )

                # Fetch discussion page → parse question
                time.sleep(random.uniform(1.5, 3.0))
                disc_r = self.session.get(discussion_url, timeout=30)

                if disc_r.status_code != 200:
                    print(f"[ajax-scraper] Discussion HTTP {disc_r.status_code} for Q{q_num}: {discussion_url}")
                    continue
                if self._is_blocked(disc_r.text):
                    print(f"[ajax-scraper] Blocked on Q{q_num} discussion page")
                    continue

                disc_soup = BeautifulSoup(disc_r.text, "lxml")
                question_text  = self._extract_question_text(disc_soup)
                options        = self._extract_options(disc_soup)
                correct_answer = self._extract_correct_answer(disc_soup, options)
                topic          = self._extract_topic(disc_soup, discussion_url)

                if not comments:
                    comments = self._extract_comments(disc_soup)

                if not question_text or not options:
                    print(f"[ajax-scraper] Parse failed Q{q_num}: {discussion_url}")
                    continue

                results.append({
                    "question_number":  q_num,
                    "url":              discussion_url,
                    "exam_question_id": data_id,
                    "question_text":    question_text,
                    "options":          options,
                    "correct_answer":   correct_answer,
                    "topic":            topic,
                    "comments":         comments,
                })
                print(f"[ajax-scraper] Q{q_num} OK: {question_text[:60]}")

            except Exception as exc:
                print(f"[ajax-scraper] ERROR Q{q_num}: {exc}")

            if progress_callback:
                progress_callback(q_num, total_questions, len(results), None)

        results.sort(key=lambda x: x["question_number"])
        print(f"[ajax-scraper] Complete — {len(results)}/{total_questions} questions")
        return results

    def scrape_question(self, url: str) -> Optional[dict]:
        try:
            time.sleep(random.uniform(1.5, 3.5))
            response = self.session.get(url, timeout=30)

            if response.status_code != 200:
                print(f"[scraper] HTTP {response.status_code} — {url}")
                return None

            # Detect Cloudflare challenge / login wall
            if self._is_blocked(response.text):
                print(f"[scraper] BLOCKED or REDIRECT — {url}")
                return None

            html = response.text  # auto-decompresses gzip/deflate/br
            soup = BeautifulSoup(html, "lxml")
            result = self._parse(soup, url)

            if result:
                print(f"[scraper] OK  — Q:{result['question_text'][:60]}…  Ans:{result['correct_answer']}")
            else:
                print(f"[scraper] PARSE FAILED — {url}")
                self._dump_html(url, html)

            return result

        except Exception as exc:
            print(f"[scraper] ERROR — {url} — {exc}")
            return None

    def debug_scrape(self, url: str) -> dict:
        """
        Returns: HTTP status, html snippet, CSS classes found, parsed result.
        Full HTML is saved to /tmp/debug_*.html for manual inspection.
        """
        try:
            time.sleep(1)
            response = self.session.get(url, timeout=30)

            # response.text uses charset from Content-Type and auto-decompresses
            # gzip/deflate/br (br requires the `brotli` package installed).
            html = response.text

            soup = BeautifulSoup(html, "lxml")

            all_classes = sorted({
                cls
                for tag in soup.find_all(True)
                for cls in (tag.get("class") or [])
            })

            parsed = self._parse(soup, url)
            self._dump_html(url, html, prefix="debug")

            return {
                "status_code": response.status_code,
                "is_blocked": self._is_blocked(html),
                "html_snippet": html[:3000],
                "all_classes": all_classes[:150],
                "parsed": parsed,
            }
        except Exception as exc:
            return {"error": str(exc)}

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _is_blocked(self, html: str) -> bool:
        # Only match actual challenge/block pages, not legitimate CF features
        # like __cf_email__ (email obfuscation used on normal pages).
        hard_signals = [
            "cf-browser-verification",
            "Checking your browser before accessing",
            "Just a moment...",
            "DDoS protection by Cloudflare",
            "Enable JavaScript and cookies to continue",
            "Please turn JavaScript on",
        ]
        return any(s in html for s in hard_signals)

    def _dump_html(self, url: str, html: str, prefix: str = "fail"):
        slug = re.sub(r"[^\w]", "_", url)[-60:]
        path = Path(f"/tmp/{prefix}_{slug}.html")
        path.write_text(html, encoding="utf-8")
        print(f"[scraper] HTML dumped → {path}")

    # ------------------------------------------------------------------ #
    # Parsing
    # ------------------------------------------------------------------ #

    def _parse(self, soup: BeautifulSoup, url: str) -> Optional[dict]:
        question_text = self._extract_question_text(soup)
        if not question_text:
            return None

        options = self._extract_options(soup)
        correct_answer = self._extract_correct_answer(soup, options)
        topic = self._extract_topic(soup, url)
        comments = self._extract_comments(soup)

        return {
            "url": url,
            "question_text": question_text,
            "options": options,
            "correct_answer": correct_answer,
            "topic": topic,
            "comments": comments,
        }

    def _extract_comments(self, soup: BeautifulSoup) -> list[dict]:
        """
        Extracts discussion comments from the page.
        Each comment-container has: username, selected answer, body text.
        Returns top 15 non-empty comments.
        """
        results = []
        containers = soup.find_all(class_="comment-container")

        for container in containers[:20]:
            username_el = container.find(class_="comment-username")
            answer_el   = container.find(class_="comment-selected-answers")
            body_el     = container.find(class_="comment-body")

            if not body_el:
                continue

            text = body_el.get_text(" ", strip=True)
            if len(text) < 10:
                continue

            selected = ""
            if answer_el:
                m = re.search(r"\b([A-E])\b", answer_el.get_text())
                if m:
                    selected = m.group(1)

            results.append({
                "username":        username_el.get_text(strip=True) if username_el else "Anonymous",
                "selected_answer": selected,
                "text":            text[:1200],
            })

            if len(results) == 15:
                break

        return results

    def _extract_question_text(self, soup: BeautifulSoup) -> str:
        # Try selectors from most-specific to most-generic
        candidates = [
            soup.find("div", class_="question-body"),
            soup.find("div", class_="question-text"),
            soup.find("div", class_="card-text"),
            soup.find("div", class_="card-body"),
            soup.find("div", id=re.compile(r"question", re.I)),
        ]

        for body in candidates:
            if not body:
                continue

            # Prefer a <p class="card-text"> inside the container
            p = body.find("p", class_="card-text")
            if p and len(p.get_text(strip=True)) > 10:
                return p.get_text(" ", strip=True)

            # Or any <p> longer than 20 chars
            for p in body.find_all("p"):
                text = p.get_text(" ", strip=True)
                if len(text) > 20:
                    return text

        # Last resort: look for any standalone <p> near the top with enough text
        for p in soup.find_all("p"):
            text = p.get_text(" ", strip=True)
            if len(text) > 40:
                return text

        return ""

    def _extract_options(self, soup: BeautifulSoup) -> dict[str, str]:
        options: dict[str, str] = {}

        # ── Standard list-item options ───────────────────────────────────
        item_sets = [
            soup.find_all("li", class_="multi-choice-item"),
            soup.find_all("li", class_=re.compile(r"choice|option|answer", re.I)),
            soup.select(".question-choices li"),
            soup.select(".answer-choices li"),
            soup.select("ul.list-group li"),
        ]

        items = next((s for s in item_sets if s), [])

        for idx, item in enumerate(items[:6]):
            letter = chr(65 + idx)
            raw = item.get_text(" ", strip=True)
            raw = re.sub(r"^[A-F][.)]\s*", "", raw).strip()
            if raw:
                options[letter] = raw

        if options:
            return options

        # ── Image-based options ──────────────────────────────────────────
        # Some questions have CLI screenshots as options, embedded in the
        # card-text paragraph as: "A.<br/><img class='in-exam-image' src='...'/>".
        # We store the image URL so the question is still usable.
        body = (
            soup.find(class_="question-body")
            or soup.find("p", class_="card-text")
        )
        if body:
            html_str = str(body)
            img_opts = re.findall(
                r'([A-F])\.\s*<br\s*/?>\s*<img[^>]+src=["\']([^"\']+)["\']',
                html_str,
                re.IGNORECASE,
            )
            for letter, src in img_opts:
                full_src = (
                    f"https://www.examtopics.com{src}"
                    if src.startswith("/") else src
                )
                options[letter.upper()] = f"[Imagem — ver no ExamTopics] {full_src}"

        return options

    def _extract_correct_answer(
        self,
        soup: BeautifulSoup,
        options: dict[str, str],
    ) -> str:
        """
        ExamTopics answer extraction — three tiers of confidence:

        Tier 1 — Community vote count (most reliable):
          Each comment that casts a vote renders a <div class="comment-selected-answers">
          with text like "Selected Answer: D". We count all of them and pick the majority.
          Upvote numbers are JS-rendered so they're not in the static HTML.

        Tier 2 — ExamTopics suggested answer (fallback):
          <div class="correct-answer-box"> contains "Suggested Answer: D".
          This is the answer ExamTopics itself marks, which may differ from community.

        Tier 3 — Default to first option if nothing found.
        """

        # ── Tier 1: count community "Selected Answer: X" votes ─────────
        vote_counter: dict[str, int] = {}
        for el in soup.find_all(class_="comment-selected-answers"):
            text = el.get_text(" ", strip=True)
            m = re.search(r"\b([A-E])\b", text)
            if m:
                letter = m.group(1)
                vote_counter[letter] = vote_counter.get(letter, 0) + 1

        if vote_counter:
            winner = max(vote_counter, key=lambda k: vote_counter[k])
            total = sum(vote_counter.values())
            print(f"[scraper] community votes: {dict(vote_counter)}  →  {winner} ({vote_counter[winner]}/{total})")
            return winner

        # ── Tier 2: ExamTopics "Suggested Answer" box ──────────────────
        box = soup.find(class_="correct-answer-box")
        if box:
            m = re.search(r"\b([A-E])\b", box.get_text())
            if m:
                print(f"[scraper] suggested answer box: {m.group(1)}")
                return m.group(1)

        # ── Tier 3: default ────────────────────────────────────────────
        print("[scraper] could not determine answer, defaulting to first option")
        return list(options.keys())[0] if options else "A"

    def _extract_topic(self, soup: BeautifulSoup, url: str) -> str:
        breadcrumb = soup.find("ol", class_="breadcrumb")
        if breadcrumb:
            items = breadcrumb.find_all("li")
            if len(items) >= 2:
                return items[-2].get_text(strip=True)

        m = re.search(r"topic-(\d+)", url)
        if m:
            return f"Topic {m.group(1)}"

        return "General"
