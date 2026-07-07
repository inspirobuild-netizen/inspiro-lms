import logging

from fastapi import APIRouter, Depends, HTTPException

from ..config import get_settings
from ..deps import verify_internal_key
from ..llm.groq_client import LlmError, get_groq
from ..schemas import ResolveDoubtRequest, ResolveDoubtResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/doubts", tags=["doubts"], dependencies=[Depends(verify_internal_key)])

SYSTEM_PROMPT = """You are an expert civil services (UPSC and Kerala PSC) tutor at Inspiro coaching institute.
Answer the student's doubt accurately and concisely in {language_name}.

Rules:
- If course context is provided, ground your answer in it and cite which source you used.
- If you are not confident the answer is correct, say so plainly — never invent facts, dates, article numbers, or names.
- Keep answers exam-focused: what the student needs to remember for prelims/mains.
- Use simple language; students range from beginners to repeaters.

Respond in JSON with exactly these keys:
{{"answer": string, "confidence": number between 0 and 1, "sources": array of source titles you actually used}}"""

ESCALATION_THRESHOLD = 0.55


@router.post("/resolve", response_model=ResolveDoubtResponse)
async def resolve_doubt(req: ResolveDoubtRequest) -> ResolveDoubtResponse:
    settings = get_settings()
    language_name = "Malayalam" if req.language == "ml" else "English"

    context_block = ""
    if req.context:
        parts: list[str] = []
        total = 0
        for chunk in req.context:
            snippet = f"[{chunk.source}]\n{chunk.text}"
            total += len(snippet)
            if total > settings.max_context_chars:
                break
            parts.append(snippet)
        context_block = "\n\nCourse context:\n" + "\n---\n".join(parts)

    subject_line = f"Subject: {req.subject}\n" if req.subject else ""
    user_prompt = f"{subject_line}Student's doubt: {req.question}{context_block}"

    try:
        data = await get_groq().chat_json(
            SYSTEM_PROMPT.format(language_name=language_name), user_prompt
        )
    except LlmError:
        logger.exception("Doubt resolution failed")
        raise HTTPException(status_code=502, detail="AI backend unavailable") from None

    answer = str(data.get("answer", "")).strip()
    try:
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    sources = [str(s) for s in data.get("sources", []) if isinstance(s, str)][:8]

    if not answer:
        raise HTTPException(status_code=502, detail="AI returned empty answer")

    return ResolveDoubtResponse(
        answer=answer,
        confidence=confidence,
        escalate=confidence < ESCALATION_THRESHOLD,
        sources=sources,
    )
