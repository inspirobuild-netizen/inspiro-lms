import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..deps import verify_internal_key
from ..llm.groq_client import LlmError, get_groq
from ..schemas import CoachPlanRequest, CoachPlanResponse, PlanDay

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/coach", tags=["coach"], dependencies=[Depends(verify_internal_key)])

SYSTEM_PROMPT = """You are a personal performance coach for civil services aspirants at Inspiro coaching institute (UPSC / Kerala PSC).
Given a student's recent performance data, produce a practical 7-day study plan in {language_name}.

Rules:
- Base every recommendation strictly on the data given — do not invent scores or subjects.
- Weaknesses = subjects with low or declining scores; strengths = consistently high scores.
- The weekly plan must weight weak subjects heavier but keep strong subjects warm (spaced revision).
- Each day: one clear focus and 2-4 concrete tasks (e.g. "40 MCQs on Polity fundamental rights", "revise yesterday's wrong answers").
- at_risk is true only when the data shows real disengagement: very low study time AND falling scores AND broken streak.
- motivation: 1-2 sentences, specific to their data, never generic filler.

Respond in JSON with exactly this shape:
{{"strengths": [str], "weaknesses": [str], "weekly_plan": [{{"day": "Monday", "focus": str, "tasks": [str]}}], "at_risk": bool, "motivation": str}}"""


@router.post("/plan", response_model=CoachPlanResponse)
async def generate_plan(req: CoachPlanRequest) -> CoachPlanResponse:
    language_name = "Malayalam" if req.language == "ml" else "English"

    subject_lines = "\n".join(
        f"- {s.subject}: {s.attempts} attempts, avg {s.avg_percent:.0f}%, latest {s.last_percent:.0f}%"
        for s in req.subjects
    ) or "- No exam attempts yet"

    user = (
        f"Target exam: {req.target_exam}\n"
        f"Subject performance:\n{subject_lines}\n"
        f"Current streak: {req.streak_days} days\n"
        f"Study time last 30 days: {req.study_minutes_last_30d} minutes\n"
        f"Lessons completed last 30 days: {req.lessons_completed_last_30d}"
    )

    try:
        data = await get_groq().chat_json(
            SYSTEM_PROMPT.format(language_name=language_name), user, max_tokens=6000
        )
    except LlmError:
        logger.exception("Coach plan generation failed")
        raise HTTPException(status_code=502, detail="AI backend unavailable") from None

    raw_plan = data.get("weekly_plan")
    if not isinstance(raw_plan, list) or not raw_plan:
        raise HTTPException(status_code=502, detail="AI returned no plan")

    plan: list[PlanDay] = []
    for item in raw_plan[:7]:
        try:
            plan.append(PlanDay.model_validate(item))
        except ValidationError:
            logger.warning("Dropping malformed plan day")
    if not plan:
        raise HTTPException(status_code=502, detail="AI returned only malformed plan days")

    return CoachPlanResponse(
        strengths=[str(s) for s in data.get("strengths", []) if isinstance(s, str)][:5],
        weaknesses=[str(s) for s in data.get("weaknesses", []) if isinstance(s, str)][:5],
        weekly_plan=plan,
        at_risk=bool(data.get("at_risk", False)),
        motivation=str(data.get("motivation", "")).strip(),
    )
