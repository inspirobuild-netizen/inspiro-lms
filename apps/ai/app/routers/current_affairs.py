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
- exam_relevance: one or two sentences on which papers/topics this maps to (e.g. GS2 Polity, GS3 Economy, Kerala PSC current affairs).
- tags: 3-6 short topical tags.
- MCQs (if requested): 2 questions strictly answerable from the article text only.

Respond in JSON with exactly this shape:
{"summary": str, "exam_relevance": str, "tags": [str], "mcqs": [{"question": str, "options": [str, str, str, str], "correct_index": 0-3, "explanation": str, "difficulty": "easy"|"medium"|"hard"}]}"""


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
        tags=[str(t) for t in data.get("tags", []) if isinstance(t, str)][:6],
        mcqs=mcqs,
    )
