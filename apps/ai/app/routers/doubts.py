import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..config import get_settings
from ..deps import verify_internal_key
from ..llm.groq_client import LlmError, get_groq
from ..schemas import ResolveDoubtRequest, ResolveDoubtResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/doubts", tags=["doubts"], dependencies=[Depends(verify_internal_key)])

# The model has no clock and its knowledge stops well before today, so both are
# stated. Without this it answered "who is the Vice-President" with the name it
# was trained on, at 90%+ confidence, two office-holders later.
SYSTEM_PROMPT = """You are an expert civil services (UPSC) tutor at Inspiro coaching institute.
Answer the student's doubt accurately and concisely in {language_name}.

Today is {today}. Your own knowledge stops around {cutoff}, so anything that can change (who holds an office, the latest budget or tax figures, a recent scheme, report, ranking, judgment, appointment or event) may be out of date in your memory.

Rules:
- Context may be provided: course material, and current-affairs items marked with their dates. Ground your answer in it and name the sources you used, exactly as they are titled. Where context and your memory disagree, trust the context, and prefer its most recent item.
- For anything that can change: if the context settles it, answer from the context. If it does not, say what you know, state plainly that this is as of {cutoff} and may have changed since, and tell the student to confirm it in Current Affairs or with a mentor. Never present a remembered office-holder, figure or recent event as current.
- If you are not confident the answer is correct, say so plainly. Never invent facts, dates, article numbers, or names.
- Keep answers exam-focused: what the student needs to remember for prelims/mains.
- Use simple language; students range from beginners to repeaters.

Respond in JSON with exactly these keys:
{{"answer": string, "confidence": number between 0 and 1, "sources": array of the context titles you actually used (empty if none), "may_be_outdated": boolean, true when the answer depends on facts that can change and the context did not settle them}}"""

ESCALATION_THRESHOLD = 0.55
# An answer that may be out of date is never left standing on its own: at this
# confidence it goes to a mentor to confirm, with the AI's answer attached.
OUTDATED_CONFIDENCE_CAP = 0.5

IST = timezone(timedelta(hours=5, minutes=30))

# Wording that ties an answer to when it is given. The model is asked to flag
# such answers itself and often does not: in testing both models gave a
# superseded income-tax limit at 95-100% confidence, unflagged. So the question
# is checked as well. A false positive costs one mentor review; a miss puts a
# stale "fact" in front of a student as current.
_TIME_SENSITIVE = re.compile(
    r"\b(?:current(?:ly)?|present(?:ly)?|at present|now|nowadays|today|latest|recent(?:ly)?|"
    r"this year|last year|incumbent|as of|new(?:ly)?\s+(?:appointed|elected|launched|announced)|"
    r"20(?:2[4-9]|[3-9]\d)|"
    r"union budget|budget\s+20\d\d|income[- ]tax|tax\s+(?:slab|regime|rate)s?|repo rate|gst rate|"
    r"who\s+is\s+(?:the\s+)?(?:president|vice[- ]?president|prime minister|chief minister|governor|"
    r"chief justice|cji|speaker|chairman|chairperson|chief election commissioner|cec|"
    r"attorney general|cag|comptroller|chief of|rbi governor|finance minister|home minister|"
    r"defence minister))\b"
    r"|ഇപ്പോഴ|നിലവില|ഏറ്റവും പുതിയ|ഈ വർഷ",
    re.IGNORECASE,
)

_OUTDATED_NOTE = {
    "en": "Note: this can change over time. My information is as of {cutoff}, so please confirm it in Current Affairs or with your mentor.",
    "ml": "ശ്രദ്ധിക്കുക: ഇത് കാലക്രമേണ മാറാവുന്ന വിവരമാണ്. എന്റെ അറിവ് {cutoff} വരെയുള്ളതാണ്. കറന്റ് അഫയേഴ്സിൽ നോക്കിയോ മെന്ററോട് ചോദിച്ചോ ഉറപ്പാക്കുക.",
}


def looks_time_sensitive(question: str) -> bool:
    return _TIME_SENSITIVE.search(question) is not None


def _today() -> str:
    return datetime.now(IST).strftime("%d %B %Y").lstrip("0")


def _grounded_sources(claimed: object, context_titles: list[str]) -> list[str]:
    """Only sources that were actually in the context. Left to itself the model
    cites "Wikipedia" or a newspaper it never saw, which reads as verification."""
    if not isinstance(claimed, list):
        return []
    wanted = [str(s).strip() for s in claimed if isinstance(s, str) and s.strip()]
    kept: list[str] = []
    for title in context_titles:
        low = title.lower()
        if any(w.lower() in low or low in w.lower() for w in wanted) and title not in kept:
            kept.append(title)
    return kept[:8]


@router.post("/resolve", response_model=ResolveDoubtResponse)
async def resolve_doubt(req: ResolveDoubtRequest) -> ResolveDoubtResponse:
    settings = get_settings()
    language_name = "Malayalam" if req.language == "ml" else "English"

    context_block = ""
    context_titles: list[str] = []
    if req.context:
        parts: list[str] = []
        total = 0
        for chunk in req.context:
            snippet = f"[{chunk.source}]\n{chunk.text}"
            total += len(snippet)
            if total > settings.max_context_chars:
                break
            parts.append(snippet)
            context_titles.append(chunk.source)
        context_block = "\n\nContext:\n" + "\n---\n".join(parts)

    subject_line = f"Subject: {req.subject}\n" if req.subject else ""
    user_prompt = f"{subject_line}Student's doubt: {req.question}{context_block}"

    # The doubt model first; if it fails (retired, rate-limited past its
    # retries, bad JSON), once more on the main model before giving up.
    attempts: list[tuple[str | None, str]] = []
    if settings.groq_doubt_model and settings.groq_doubt_model != settings.groq_model:
        attempts.append(
            (settings.groq_doubt_model, settings.groq_doubt_knowledge_cutoff or settings.groq_knowledge_cutoff)
        )
    attempts.append((None, settings.groq_knowledge_cutoff))

    data: dict | None = None
    cutoff = settings.groq_knowledge_cutoff
    for index, (model, model_cutoff) in enumerate(attempts):
        try:
            data = await get_groq().chat_json(
                SYSTEM_PROMPT.format(language_name=language_name, today=_today(), cutoff=model_cutoff),
                user_prompt,
                model=model,
            )
            cutoff = model_cutoff
            break
        except LlmError:
            if index == len(attempts) - 1:
                logger.exception("Doubt resolution failed")
                raise HTTPException(status_code=502, detail="AI backend unavailable") from None
            logger.warning("Doubt model %s failed; retrying on the main model", model)
    assert data is not None

    answer = str(data.get("answer", "")).strip()
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    sources = _grounded_sources(data.get("sources", []), context_titles)

    if not answer:
        raise HTTPException(status_code=502, detail="AI returned empty answer")

    # Settled by a dated current-affairs item = current enough. Otherwise the
    # model's own flag, or the wording of the question, marks it as perishable.
    settled_by_news = any(s.lower().startswith("current affairs") for s in sources)
    flagged_by_model = data.get("may_be_outdated") is True
    may_be_outdated = not settled_by_news and (flagged_by_model or looks_time_sensitive(req.question))

    if may_be_outdated:
        confidence = min(confidence, OUTDATED_CONFIDENCE_CAP)
        if not flagged_by_model:
            # The model wrote its own caveat when it raised the flag itself.
            answer = f"{answer}\n\n{_OUTDATED_NOTE[req.language].format(cutoff=cutoff)}"

    return ResolveDoubtResponse(
        answer=answer,
        confidence=confidence,
        escalate=confidence < ESCALATION_THRESHOLD,
        sources=sources,
        may_be_outdated=may_be_outdated,
    )
