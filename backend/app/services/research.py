import json
import re
from datetime import datetime, timezone

import httpx

from app.config import get_settings
import uuid

from app.db import SessionLocal
from app.models import ChatMessage, ResearchTask
from app.services.search import search_web
from app.services.web_fetch import fetch_url_content

settings = get_settings()

import asyncio

MAX_ROUNDS = 3
MAX_SOURCES_PER_ROUND = 3

PLAN_PROMPT = """Analyze this research question and create a research plan.

Question: {query}

Return a JSON object with:
- "sub_questions": list of 3-5 specific sub-questions to investigate
- "search_queries": list of 3-4 search queries to start with

Return ONLY valid JSON, no markdown fences, no other text."""

SEARCH_QUERIES_PROMPT = """Generate new search queries based on the research so far.

Question: {query}
Current report so far: {report}
Queries already used: {prev_queries}

Generate 3 NEW search queries that fill gaps in the current report.
Return ONLY a JSON array of strings. No markdown fences."""

EXTRACT_PROMPT = """Extract key findings from this source.

Research question: {query}
Source URL: {url}
Content:
{content}

Return a JSON object with:
- "summary": 2-3 sentence summary of key findings
- "evidence": list of specific facts, data points, or quotes (max 5)
- "relevance": "high", "medium", or "low"

Return ONLY valid JSON, no markdown fences."""

SYNTHESIZE_PROMPT = """Update the research report with new findings.

Question: {query}

Current report:
{report}

New findings:
{findings}

Write an updated report incorporating the new information.
Use markdown headings and inline citations like [1], [2].

At the very end, on a new line, write either:
VERDICT: COMPLETE — if the report thoroughly answers the question
VERDICT: INCOMPLETE — if more research is needed"""

FINAL_REPORT_PROMPT = """Write the final polished research report.

Question: {query}

Draft report:
{report}

Sources used:
{sources}

Write a comprehensive report with:
1. Executive summary (2-3 sentences)
2. Detailed findings organized by topic with markdown headings
3. Key conclusions
4. Numbered source list at the end

Use inline citations [1], [2], etc. Minimum 800 words. Be thorough."""


class ResearchEngine:
    def __init__(
        self,
        research_id: str,
        query: str,
        user_id: str,
        http_client: httpx.AsyncClient,
        conversation_id: str | None = None,
    ):
        self.research_id = research_id
        self.query = query
        self.user_id = user_id
        self.http_client = http_client
        self.conversation_id = conversation_id
        self.report = ""
        self.findings: list[dict] = []
        self.sources: list[dict] = []
        self.prev_queries: list[str] = []
        self.current_round = 0

    async def _fetch_and_extract(self, result: dict) -> dict | None:
        try:
            page = await fetch_url_content(result["url"])
            if not page["success"]:
                return None
            extract = await self._llm_call(
                EXTRACT_PROMPT.format(
                    query=self.query,
                    url=result["url"],
                    content=page["content"][:8000],
                ),
                max_tokens=1024,
            )
            finding = json.loads(self._strip_json_fences(extract))
            finding["url"] = result["url"]
            finding["title"] = result["title"]
            return finding
        except Exception:
            return None

    async def run(self) -> str:
        try:
            await self._update_status("planning")
            plan = await self._llm_call(PLAN_PROMPT.format(query=self.query), max_tokens=1024)
            try:
                plan_data = json.loads(self._strip_json_fences(plan))
                search_queries = plan_data.get("search_queries", [self.query])
            except (json.JSONDecodeError, ValueError):
                search_queries = [self.query]

            for round_num in range(MAX_ROUNDS):
                self.current_round = round_num + 1
                await self._update_status("searching")

                search_tasks = [search_web(q, num_results=5) for q in search_queries[:3]]
                search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
                all_results = []
                for r in search_results:
                    if isinstance(r, list):
                        all_results.extend(r)
                self.prev_queries.extend(search_queries)

                seen_urls = {s["url"] for s in self.sources}
                new_results = [
                    r for r in all_results if r["url"] not in seen_urls
                ][:MAX_SOURCES_PER_ROUND]

                if not new_results and self.current_round >= 2:
                    break

                await self._update_status("reading")
                extract_tasks = [self._fetch_and_extract(r) for r in new_results]
                extracted = await asyncio.gather(*extract_tasks)
                round_findings = [f for f in extracted if f is not None]

                for f in round_findings:
                    self.sources.append({"title": f["title"], "url": f["url"]})

                if round_findings:
                    self.findings.extend(round_findings)
                    await self._update_status("analyzing")

                    findings_text = "\n\n".join(
                        f"[{len(self.sources) - len(round_findings) + i + 1}] {f.get('title', '')} ({f.get('url', '')})\n{f.get('summary', '')}"
                        for i, f in enumerate(round_findings)
                    )
                    synthesis = await self._llm_call(
                        SYNTHESIZE_PROMPT.format(
                            query=self.query,
                            report=(self.report or "(No report yet — start fresh)")[:6000],
                            findings=findings_text[:4000],
                        )
                    )

                    if "VERDICT: COMPLETE" in synthesis:
                        self.report = synthesis.replace("VERDICT: COMPLETE", "").strip()
                        break
                    self.report = synthesis.replace("VERDICT: INCOMPLETE", "").strip()

                if self.current_round < MAX_ROUNDS:
                    new_q = await self._llm_call(
                        SEARCH_QUERIES_PROMPT.format(
                            query=self.query,
                            report=self.report[:2000],
                            prev_queries=json.dumps(self.prev_queries),
                        ),
                        max_tokens=512,
                    )
                    try:
                        search_queries = json.loads(self._strip_json_fences(new_q))
                    except (json.JSONDecodeError, ValueError):
                        search_queries = [self.query]

            await self._update_status("writing")
            sources_text = "\n".join(
                f"[{i + 1}] {s['title']} — {s['url']}"
                for i, s in enumerate(self.sources)
            )
            final = await self._llm_call(
                FINAL_REPORT_PROMPT.format(
                    query=self.query,
                    report=self.report,
                    sources=sources_text,
                )
            )

            await self._update_status("done", report=final)

            db = SessionLocal()
            try:
                # Save summary to conversation so LLM can discuss it
                if self.conversation_id:
                    summary = final[:600].rsplit(".", 1)[0] + "." if len(final) > 600 else final
                    db.add(ChatMessage(
                        id=str(uuid.uuid4()),
                        conversation_id=self.conversation_id,
                        role="user",
                        content=f"Research: {self.query}",
                        token_count=len(self.query) // 3,
                    ))
                    db.add(ChatMessage(
                        id=str(uuid.uuid4()),
                        conversation_id=self.conversation_id,
                        role="assistant",
                        content=f"[Research complete — {len(self.sources)} sources, {self.current_round} rounds]\n\n{summary}\n\n*(Full report available in Research tab)*",
                        token_count=len(summary) // 3,
                    ))
                    conv = db.query(ResearchTask).filter(ResearchTask.id == self.research_id).first()
                    if conv:
                        from datetime import datetime, timezone as tz
                        conv.updated_at = datetime.now(tz.utc)
                    db.commit()

                # Index into RAG
                try:
                    from app.services.rag import index_content
                    index_content(
                        db, self.user_id, "research",
                        self.research_id, self.query, final,
                    )
                except Exception:
                    pass
            finally:
                db.close()

            return final

        except Exception as e:
            await self._update_status("failed", report=f"Research failed: {e}")
            raise

    async def _llm_call(self, prompt: str, max_tokens: int = 4096) -> str:
        resp = await self.http_client.post(
            f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"},
            json={
                "model": settings.DEFAULT_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": max_tokens,
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        return re.sub(r"<think>[\s\S]*?</think>\s*", "", text).strip()

    def _strip_json_fences(self, text: str) -> str:
        text = re.sub(r"^```(?:json)?\s*", "", text.strip())
        text = re.sub(r"\s*```$", "", text)
        return text

    async def _update_status(
        self, status: str, report: str | None = None
    ):
        db = SessionLocal()
        try:
            r = db.query(ResearchTask).filter(ResearchTask.id == self.research_id).first()
            if r:
                r.status = status
                r.current_round = self.current_round
                r.sources_count = len(self.sources)
                r.findings = self.findings
                r.sources = self.sources
                if report is not None:
                    r.report = report
                r.updated_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
