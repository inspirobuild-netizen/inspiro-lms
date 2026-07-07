import logging

from fastapi import APIRouter, Depends, HTTPException

from ..deps import verify_internal_key
from ..llm.groq_client import LlmError, get_groq
from ..schemas import (
    MonthlyReportRequest,
    MonthlyReportResponse,
    TagContentRequest,
    TagContentResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/content", tags=["content"], dependencies=[Depends(verify_internal_key)])

TAG_PROMPT = """You are a content classifier for a civil services (UPSC / Kerala PSC) coaching platform.
Classify the given {kind} text.

Rules:
- tags: 3-6 short lowercase topical tags (e.g. "fundamental rights", "monetary policy", "mughal empire"). Specific over generic.
- subject: one of Polity, History, Geography, Economy, Science & Tech, Environment, Current Affairs, Kerala GK, Other.
- difficulty: judge by how much prior knowledge the text demands.

Respond in JSON: {{"tags": [str], "subject": str, "difficulty": "easy"|"medium"|"hard"}}"""

REPORT_PROMPT = """You are an academic analyst writing a monthly batch report for the directors of Inspiro coaching institute.
Write in clear professional English. Base every statement strictly on the numbers given — never invent data.

- narrative: 4-6 sentences summarising the batch's month (engagement, performance, trajectory).
- highlights: 2-4 bullet points of genuinely good news from the data.
- concerns: 1-3 bullet points that need management attention (empty list if truly none).
- recommendations: 2-3 concrete actions for the coming month.

Respond in JSON: {"narrative": str, "highlights": [str], "concerns": [str], "recommendations": [str]}"""


@router.post("/tag", response_model=TagContentResponse)
async def tag_content(req: TagContentRequest) -> TagContentResponse:
    try:
        data = await get_groq().chat_json(
            TAG_PROMPT.format(kind=req.kind), req.text, temperature=0.1, max_tokens=500
        )
    except LlmError:
        logger.exception("Content tagging failed")
        raise HTTPException(status_code=502, detail="AI backend unavailable") from None

    tags = [str(t).strip().lower() for t in data.get("tags", []) if isinstance(t, str)][:6]
    if not tags:
        raise HTTPException(status_code=502, detail="AI returned no tags")

    difficulty = data.get("difficulty")
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    return TagContentResponse(
        tags=tags,
        subject=str(data.get("subject", "Other"))[:100],
        difficulty=difficulty,
    )


@router.post("/monthly-report", response_model=MonthlyReportResponse)
async def monthly_report(req: MonthlyReportRequest) -> MonthlyReportResponse:
    subject_lines = "\n".join(
        f"- {s.subject}: avg {s.avg_percent:.0f}% over {s.attempts} attempts"
        for s in req.subject_averages
    ) or "- No exam data this month"

    user = (
        f"Batch: {req.batch_name}\nMonth: {req.month}\n"
        f"Enrolled students: {req.enrolled_students}\n"
        f"Active students (attempted at least one exam): {req.active_students}\n"
        f"Attendance: {req.attendance_percent:.0f}%\n"
        f"Exams conducted: {req.exams_conducted}\n"
        f"Subject averages:\n{subject_lines}"
    )

    try:
        data = await get_groq().chat_json(REPORT_PROMPT, user, max_tokens=4000)
    except LlmError:
        logger.exception("Monthly report generation failed")
        raise HTTPException(status_code=502, detail="AI backend unavailable") from None

    narrative = str(data.get("narrative", "")).strip()
    if not narrative:
        raise HTTPException(status_code=502, detail="AI returned empty report")

    def str_list(key: str, cap: int) -> list[str]:
        return [str(x) for x in data.get(key, []) if isinstance(x, str)][:cap]

    return MonthlyReportResponse(
        narrative=narrative,
        highlights=str_list("highlights", 4),
        concerns=str_list("concerns", 3),
        recommendations=str_list("recommendations", 3),
    )
