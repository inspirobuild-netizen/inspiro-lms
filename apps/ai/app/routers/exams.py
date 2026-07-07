import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..deps import verify_internal_key
from ..llm.groq_client import LlmError, get_groq
from ..schemas import GeneratedQuestion, GenerateExamRequest, GenerateExamResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/exams", tags=["exams"], dependencies=[Depends(verify_internal_key)])

STYLE_NOTES = {
    "upsc_prelims": "Match UPSC Prelims style: statement-based questions ('Consider the following statements'), elimination-friendly options, current-affairs linkage where natural.",
    "kerala_psc": "Match Kerala PSC style: direct factual questions, Kerala-specific context where relevant, straightforward single-fact options.",
    "generic": "Clear, unambiguous MCQs suitable for competitive exam practice.",
}

SYSTEM_PROMPT = """You are an expert question setter for Indian civil services exams at Inspiro coaching institute.
Generate multiple-choice questions in {language_name}.

{style_note}

Hard rules:
- Exactly 4 options per question, exactly one correct.
- Never two options that are both defensibly correct.
- The explanation must teach: state WHY the answer is right and why the closest distractor is wrong.
- Facts must be real and verifiable — no invented statistics, articles, or dates. If unsure of a fact, pick a different question.
- Vary question phrasing; do not start every question the same way.

Respond in JSON with exactly this shape:
{{"questions": [{{"question": str, "options": [str, str, str, str], "correct_index": 0-3, "explanation": str, "difficulty": "easy"|"medium"|"hard"}}]}}"""


@router.post("/generate", response_model=GenerateExamResponse)
async def generate_exam(req: GenerateExamRequest) -> GenerateExamResponse:
    language_name = "Malayalam" if req.language == "ml" else "English"
    system = SYSTEM_PROMPT.format(
        language_name=language_name, style_note=STYLE_NOTES[req.exam_style]
    )
    user = (
        f"Subject: {req.subject}\nTopic: {req.topic}\n"
        f"Difficulty: {req.difficulty}\nNumber of questions: {req.count}"
    )

    try:
        data = await get_groq().chat_json(system, user, temperature=0.6, max_tokens=8000)
    except LlmError:
        logger.exception("Exam generation failed")
        raise HTTPException(status_code=502, detail="AI backend unavailable") from None

    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list) or not raw_questions:
        raise HTTPException(status_code=502, detail="AI returned no questions")

    questions: list[GeneratedQuestion] = []
    for item in raw_questions[: req.count]:
        try:
            questions.append(GeneratedQuestion.model_validate(item))
        except ValidationError:
            logger.warning("Dropping malformed generated question")

    if not questions:
        raise HTTPException(status_code=502, detail="AI returned only malformed questions")

    return GenerateExamResponse(topic=req.topic, questions=questions)
