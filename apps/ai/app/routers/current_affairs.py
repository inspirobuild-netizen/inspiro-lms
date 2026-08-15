import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..deps import verify_internal_key
from ..llm.groq_client import LlmError, get_groq
from ..schemas import GeneratedQuestion, SummarizeArticleRequest, SummarizeArticleResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ai/current-affairs",
    tags=["current-affairs"],
    dependencies=[Depends(verify_internal_key)],
)

SYSTEM_PROMPT = """You are a current-affairs analyst for civil services aspirants (UPSC / Kerala PSC) at Inspiro.
Given a news article, produce exam-oriented notes.

Rules:
- Summary: 3-5 crisp sentences covering only exam-relevant facts (who/what/when/why it matters).
- exam_relevance: one or two sentences on which papers/topics this maps to (e.g. GS2 Polity, GS3 Economy, Kerala PSC current affairs). If it maps to nothing, say so plainly.
- exam_relevance_score: a number from 0.0 to 1.0, graded against the rubric below.
- tags: 3-6 short topical tags.
- MCQs (if requested): 2 questions strictly answerable from the article text only.

Scoring rubric for exam_relevance_score — use the WHOLE range, and judge this
article on its own merits. Most news is not exam material; a score near 0 is a
normal, expected answer, not a failure.

  0.9-1.0  Directly examinable fact or development: a Bill/Act/Amendment, a
           Supreme Court or High Court judgment, a government scheme or policy,
           a constitutional body, an official index/report/ranking, a treaty or
           summit, budget/monetary-policy decisions, official economic data.
  0.7-0.8  Strong syllabus link: substantive analysis of governance, economy,
           environment, S&T or international relations, with facts an aspirant
           would be expected to know.
  0.4-0.6  Background or context only: informed commentary on a syllabus theme
           but with few examinable specifics.
  0.1-0.3  Tangential: general news that merely touches a syllabus area.
  0.0      Not exam material at all: local crime reports, accidents, sport,
           entertainment, celebrity news, satire, opinion columns with no
           factual content, human-interest and lifestyle pieces.

Score what the article actually contains, not the topic it gestures at. A
satirical column about bureaucracy is 0.0, not 0.8, however governmental it
sounds. A local theft or arrest report is 0.0 even though policing is a state
subject.

Respond in JSON with exactly this shape:
{"summary": str, "exam_relevance": str, "exam_relevance_score": number, "tags": [str], "mcqs": [{"question": str, "options": [str, str, str, str], "correct_index": 0-3, "explanation": str, "difficulty": "easy"|"medium"|"hard"}]}"""


def _parse_score(raw: object) -> float:
    """Coerce the model's score into 0..1.

    Models return this as a float, an int, or a string like "0.8" or "80%"
    depending on the day. A missing or unparseable value falls back to 0.5 —
    deliberately below the badge threshold, so a parsing failure understates
    relevance rather than promoting an article it never graded.
    """
    if isinstance(raw, bool) or raw is None:
        return 0.5
    if isinstance(raw, int | float):
        value = float(raw)
    elif isinstance(raw, str):
        try:
            value = float(raw.strip().rstrip("%"))
        except ValueError:
            return 0.5
    else:
        return 0.5

    # Anything above 1 was meant as a percentage ("80", "80%"). Normalising in
    # both branches matters: clamping a bare 80 to 1.0 would silently promote
    # an article to maximum relevance.
    if value > 1.0:
        value /= 100.0
    # Still out of range (e.g. 999) means the model produced nonsense. Clamping
    # to 1.0 here would badge the article on the strength of a broken answer,
    # so fall back to the neutral value instead — which sits below the badge
    # threshold on purpose.
    if value > 1.0:
        return 0.5
    return max(0.0, value)


@router.post("/summarize", response_model=SummarizeArticleResponse)
async def summarize_article(req: SummarizeArticleRequest) -> SummarizeArticleResponse:
    user = f"Title: {req.title}\n\nArticle:\n{req.body}"
    if not req.generate_mcqs:
        user += "\n\nDo not generate MCQs — return an empty mcqs array."

    try:
        data = await get_groq().chat_json(SYSTEM_PROMPT, user, max_tokens=6000)
    except LlmError:
        logger.exception("Article summarization failed")
        raise HTTPException(status_code=502, detail="AI backend unavailable") from None

    summary = str(data.get("summary", "")).strip()
    if not summary:
        raise HTTPException(status_code=502, detail="AI returned empty summary")

    mcqs: list[GeneratedQuestion] = []
    if req.generate_mcqs:
        for item in data.get("mcqs", [])[:4]:
            try:
                mcqs.append(GeneratedQuestion.model_validate(item))
            except ValidationError:
                logger.warning("Dropping malformed current-affairs MCQ")

    return SummarizeArticleResponse(
        summary=summary,
        exam_relevance=str(data.get("exam_relevance", "")).strip(),
        exam_relevance_score=_parse_score(data.get("exam_relevance_score")),
        tags=[str(t) for t in data.get("tags", []) if isinstance(t, str)][:6],
        mcqs=mcqs,
    )
