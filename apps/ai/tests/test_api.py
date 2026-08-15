import pytest

GOOD_QUESTION = {
    "question": "Which article of the Indian Constitution deals with the Right to Equality?",
    "options": ["Article 14", "Article 19", "Article 21", "Article 32"],
    "correct_index": 0,
    "explanation": "Article 14 guarantees equality before law. Article 21 is life and liberty.",
    "difficulty": "easy",
}


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_rejects_missing_internal_key(client):
    res = client.post("/ai/doubts/resolve", json={"question": "What is Article 14?"})
    assert res.status_code == 401


def test_rejects_wrong_internal_key(client):
    res = client.post(
        "/ai/doubts/resolve",
        json={"question": "What is Article 14?"},
        headers={"X-Internal-Key": "wrong"},
    )
    assert res.status_code == 401


def test_doubt_resolve_confident(client, auth_headers, mock_groq):
    mock_groq(
        {
            "answer": "Article 14 guarantees equality before the law.",
            "confidence": 0.92,
            "sources": ["Polity Module 3"],
        }
    )
    res = client.post(
        "/ai/doubts/resolve",
        json={
            "question": "What does Article 14 say?",
            "subject": "Polity",
            "context": [{"source": "Polity Module 3", "text": "Article 14: equality before law..."}],
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["escalate"] is False
    assert body["confidence"] == 0.92
    assert body["sources"] == ["Polity Module 3"]


def test_doubt_resolve_low_confidence_escalates(client, auth_headers, mock_groq):
    mock_groq({"answer": "I am not certain, but possibly...", "confidence": 0.3, "sources": []})
    res = client.post(
        "/ai/doubts/resolve",
        json={"question": "Explain the 2026 amendment to the XYZ Act"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["escalate"] is True


def test_doubt_validation_rejects_short_question(client, auth_headers):
    res = client.post("/ai/doubts/resolve", json={"question": "hi"}, headers=auth_headers)
    assert res.status_code == 422


def test_exam_generate(client, auth_headers, mock_groq):
    mock_groq({"questions": [GOOD_QUESTION] * 3})
    res = client.post(
        "/ai/exams/generate",
        json={"topic": "Fundamental Rights", "subject": "Polity", "count": 3},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["questions"]) == 3
    assert body["questions"][0]["correct_index"] == 0


def test_exam_generate_drops_malformed_questions(client, auth_headers, mock_groq):
    bad = {"question": "Broken", "options": ["only", "two"], "correct_index": 5}
    mock_groq({"questions": [GOOD_QUESTION, bad]})
    res = client.post(
        "/ai/exams/generate",
        json={"topic": "Fundamental Rights", "subject": "Polity", "count": 10},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert len(res.json()["questions"]) == 1


def test_exam_generate_all_malformed_is_502(client, auth_headers, mock_groq):
    mock_groq({"questions": [{"question": "broken"}]})
    res = client.post(
        "/ai/exams/generate",
        json={"topic": "Fundamental Rights", "subject": "Polity"},
        headers=auth_headers,
    )
    assert res.status_code == 502


def test_exam_count_bounds(client, auth_headers):
    res = client.post(
        "/ai/exams/generate",
        json={"topic": "Polity basics", "subject": "Polity", "count": 500},
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_coach_plan(client, auth_headers, mock_groq):
    mock_groq(
        {
            "strengths": ["Polity"],
            "weaknesses": ["Economy", "Geography"],
            "weekly_plan": [
                {"day": "Monday", "focus": "Economy basics", "tasks": ["Read NCERT ch. 1", "20 MCQs"]},
                {"day": "Tuesday", "focus": "Geography maps", "tasks": ["Map practice: rivers"]},
            ],
            "at_risk": False,
            "motivation": "Your Polity scores are solid — Economy is one focused week away.",
        }
    )
    res = client.post(
        "/ai/coach/plan",
        json={
            "subjects": [
                {"subject": "Polity", "attempts": 5, "avg_percent": 78, "last_percent": 82},
                {"subject": "Economy", "attempts": 4, "avg_percent": 41, "last_percent": 38},
            ],
            "streak_days": 12,
            "study_minutes_last_30d": 1400,
            "target_exam": "upsc",
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["weaknesses"] == ["Economy", "Geography"]
    assert len(body["weekly_plan"]) == 2
    assert body["at_risk"] is False


def test_coach_plan_drops_malformed_days(client, auth_headers, mock_groq):
    mock_groq(
        {
            "strengths": [],
            "weaknesses": [],
            "weekly_plan": [
                {"day": "Monday", "focus": "Economy", "tasks": ["20 MCQs"]},
                {"day": "Tuesday"},  # malformed — no focus/tasks
            ],
            "at_risk": True,
            "motivation": "Restart small: one lesson today.",
        }
    )
    res = client.post("/ai/coach/plan", json={}, headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert len(body["weekly_plan"]) == 1
    assert body["at_risk"] is True


def test_coach_plan_requires_auth(client):
    res = client.post("/ai/coach/plan", json={})
    assert res.status_code == 401


def test_content_tag(client, auth_headers, mock_groq):
    mock_groq({"tags": ["Fundamental Rights", "ARTICLE 14 "], "subject": "Polity", "difficulty": "easy"})
    res = client.post(
        "/ai/content/tag",
        json={"text": "Which article of the Constitution guarantees equality before law?"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["tags"] == ["fundamental rights", "article 14"]  # normalised lowercase
    assert body["subject"] == "Polity"


def test_content_tag_bad_difficulty_defaults_medium(client, auth_headers, mock_groq):
    mock_groq({"tags": ["economy"], "subject": "Economy", "difficulty": "impossible"})
    res = client.post(
        "/ai/content/tag",
        json={"text": "Explain the difference between repo rate and reverse repo rate."},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["difficulty"] == "medium"


def test_monthly_report(client, auth_headers, mock_groq):
    mock_groq(
        {
            "narrative": "Batch Alpha maintained strong engagement in June with 85% attendance.",
            "highlights": ["Attendance held at 85%"],
            "concerns": ["Economy average dropped to 45%"],
            "recommendations": ["Schedule two extra Economy revision sessions"],
        }
    )
    res = client.post(
        "/ai/content/monthly-report",
        json={
            "batch_name": "Batch Alpha",
            "month": "2026-06",
            "enrolled_students": 120,
            "active_students": 98,
            "attendance_percent": 85,
            "exams_conducted": 6,
            "subject_averages": [{"subject": "Economy", "avg_percent": 45, "attempts": 210}],
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert "Batch Alpha" in body["narrative"]
    assert len(body["concerns"]) == 1


def test_monthly_report_rejects_bad_month(client, auth_headers):
    res = client.post(
        "/ai/content/monthly-report",
        json={
            "batch_name": "Batch Alpha",
            "month": "June 2026",
            "enrolled_students": 1,
            "active_students": 1,
            "attendance_percent": 50,
            "exams_conducted": 0,
        },
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_embeddings_endpoint(client, auth_headers, monkeypatch):
    class FakeEmbeddings:
        async def embed(self, texts):
            return [[0.1] * 1024 for _ in texts]

    monkeypatch.setattr("app.routers.embeddings.get_embeddings", lambda: FakeEmbeddings())
    res = client.post(
        "/ai/embeddings",
        json={"texts": ["Article 14 of the Constitution", "Repo rate basics"]},
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["vectors"]) == 2
    assert len(body["vectors"][0]) == 1024
    assert body["dim"] == 1024


def test_embeddings_requires_auth(client):
    res = client.post("/ai/embeddings", json={"texts": ["x"]})
    assert res.status_code == 401


def test_embeddings_rejects_empty_list(client, auth_headers):
    res = client.post("/ai/embeddings", json={"texts": []}, headers=auth_headers)
    assert res.status_code == 422


def test_current_affairs_summarize(client, auth_headers, mock_groq):
    mock_groq(
        {
            "summary": "The Union Cabinet approved a new semiconductor fab in Kerala.",
            "exam_relevance": "GS3 Economy — industrial policy; Kerala PSC current affairs.",
            "tags": ["economy", "semiconductors", "kerala"],
            "mcqs": [GOOD_QUESTION],
        }
    )
    res = client.post(
        "/ai/current-affairs/summarize",
        json={
            "title": "Cabinet approves semiconductor fab",
            "body": "The Union Cabinet on Thursday approved the establishment of a semiconductor fabrication plant..." * 2,
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert "semiconductor" in body["summary"]
    assert len(body["mcqs"]) == 1
    assert body["tags"] == ["economy", "semiconductors", "kerala"]


# ── Rate-limit handling ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_exhausted_retries_surface_as_llm_error(monkeypatch):
    """A 429 that outlives the retries must leave as LlmError, not HTTPStatusError.

    tenacity reraises the original exception type. Because the routers only
    catch LlmError, a rate-limited Groq call used to escape as an unhandled 500
    with a traceback instead of a clean 502 — and it silently dropped the
    article being ingested.
    """
    import httpx
    from tenacity import wait_none

    from app.llm.groq_client import GroqClient, LlmError

    # Don't actually sleep through the production backoff.
    monkeypatch.setattr(GroqClient._post.retry, "wait", wait_none())

    client = GroqClient.__new__(GroqClient)
    client._model = "test-model"

    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    attempts = 0

    class _Client:
        async def post(self, *_a, **_kw):
            nonlocal attempts
            attempts += 1
            return httpx.Response(429, json={"error": {"message": "rate limit"}}, request=request)

    client._client = _Client()

    with pytest.raises(LlmError):
        await client.chat("system", "user")
    assert attempts == 4, "429 should be retried before giving up"


@pytest.mark.asyncio
async def test_non_retryable_4xx_reports_body(monkeypatch, caplog):
    """A 400 must be reported with Groq's message, not just the status code."""
    import httpx

    from app.llm.groq_client import GroqClient, LlmError

    client = GroqClient.__new__(GroqClient)
    client._model = "test-model"
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")

    class _Client:
        async def post(self, *_a, **_kw):
            return httpx.Response(
                400, json={"error": {"message": "model_decommissioned"}}, request=request
            )

    client._client = _Client()

    with caplog.at_level("ERROR"), pytest.raises(LlmError):
        await client.chat("system", "user")
    assert "model_decommissioned" in caplog.text


# ── Exam-relevance score ───────────────────────────────────────────────────────

def test_relevance_score_parsing_handles_model_variety():
    """The model returns this as a float, an int, or a string, depending on the day."""
    from app.routers.current_affairs import _parse_score

    assert _parse_score(0.9) == 0.9
    assert _parse_score(0) == 0.0
    assert _parse_score(1) == 1.0
    assert _parse_score("0.75") == 0.75
    assert _parse_score("80%") == 0.8   # percent form
    assert _parse_score(80) == 0.8      # bare percent
    assert _parse_score(-2) == 0.0      # clamped up from below


def test_out_of_range_score_is_never_promoted():
    """A value above 1 is read as a percentage, not clamped up to 1.0.

    The prompt asks for 0.0-1.0, so anything above it means the model either
    used a percent scale or malfunctioned. Dividing sends a malfunction to the
    bottom; clamping would send it to maximum relevance and badge the article
    EXAM RELEVANT on the strength of a broken answer. Under-showing beats
    over-claiming, which is the whole reason this scoring was rewritten.
    """
    from app.routers.current_affairs import _parse_score

    assert _parse_score(1.4) < 0.7
    assert _parse_score(999) < 0.7


def test_relevance_score_falls_back_below_the_badge_threshold():
    """A missing or junk score must never promote an article the model never graded.

    The app badges at >= 0.7, so the fallback sits deliberately under it.
    """
    from app.routers.current_affairs import _parse_score

    for bad in (None, "high", {}, [], True, False):
        assert _parse_score(bad) < 0.7
