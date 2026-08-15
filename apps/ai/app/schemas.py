from typing import Literal

from pydantic import BaseModel, Field

# ── Doubt Resolver ─────────────────────────────────────────────────────────────

class ContextChunk(BaseModel):
    """A snippet of course content the Node API retrieved for this doubt."""

    source: str = Field(max_length=200, description="lesson/module title")
    text: str = Field(max_length=4000)


class ResolveDoubtRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    subject: str = Field(default="", max_length=100)
    context: list[ContextChunk] = Field(default_factory=list, max_length=8)
    language: Literal["en", "ml"] = "en"


class ResolveDoubtResponse(BaseModel):
    answer: str
    confidence: float = Field(ge=0, le=1)
    escalate: bool = Field(description="True when a human mentor should review")
    sources: list[str] = Field(default_factory=list)


# ── Exam Generator ─────────────────────────────────────────────────────────────

class GenerateExamRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=200)
    subject: str = Field(min_length=2, max_length=100)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    count: int = Field(default=10, ge=1, le=50)
    exam_style: Literal["upsc_prelims", "kerala_psc", "generic"] = "generic"
    language: Literal["en", "ml"] = "en"


class GeneratedQuestion(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str
    difficulty: Literal["easy", "medium", "hard"]


class GenerateExamResponse(BaseModel):
    topic: str
    questions: list[GeneratedQuestion]


# ── Content Tagger ─────────────────────────────────────────────────────────────

class TagContentRequest(BaseModel):
    text: str = Field(min_length=10, max_length=8000)
    kind: Literal["question", "lesson", "article"] = "question"


class TagContentResponse(BaseModel):
    tags: list[str] = Field(description="3-6 short topical tags")
    subject: str
    difficulty: Literal["easy", "medium", "hard"]


# ── Monthly Report ─────────────────────────────────────────────────────────────

class SubjectAverage(BaseModel):
    subject: str = Field(max_length=100)
    avg_percent: float = Field(ge=0, le=100)
    attempts: int = Field(ge=0)


class MonthlyReportRequest(BaseModel):
    batch_name: str = Field(max_length=200)
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    enrolled_students: int = Field(ge=0)
    active_students: int = Field(ge=0)
    attendance_percent: float = Field(ge=0, le=100)
    subject_averages: list[SubjectAverage] = Field(default_factory=list, max_length=20)
    exams_conducted: int = Field(ge=0)


class MonthlyReportResponse(BaseModel):
    narrative: str
    highlights: list[str]
    concerns: list[str]
    recommendations: list[str]


# ── Performance Coach ──────────────────────────────────────────────────────────

class SubjectPerformance(BaseModel):
    subject: str = Field(max_length=100)
    attempts: int = Field(ge=0)
    avg_percent: float = Field(ge=0, le=100)
    last_percent: float = Field(ge=0, le=100)


class CoachPlanRequest(BaseModel):
    subjects: list[SubjectPerformance] = Field(default_factory=list, max_length=20)
    streak_days: int = Field(default=0, ge=0)
    study_minutes_last_30d: int = Field(default=0, ge=0)
    lessons_completed_last_30d: int = Field(default=0, ge=0)
    target_exam: Literal["upsc", "kerala_psc", "generic"] = "generic"
    language: Literal["en", "ml"] = "en"


class PlanDay(BaseModel):
    day: str
    focus: str
    tasks: list[str] = Field(min_length=1, max_length=5)


class CoachPlanResponse(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    weekly_plan: list[PlanDay]
    at_risk: bool = Field(description="True when engagement/scores signal dropout risk")
    motivation: str


# ── Current Affairs ────────────────────────────────────────────────────────────

class SummarizeArticleRequest(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=50, max_length=20000)
    generate_mcqs: bool = True


class SummarizeArticleResponse(BaseModel):
    summary: str
    exam_relevance: str
    # 0..1. The API used to derive this by regexing `exam_relevance` prose,
    # which matched the paper names a dismissal also mentions — every article
    # scored the same. The model now grades against a rubric and returns the
    # number directly.
    exam_relevance_score: float = Field(default=0.5, ge=0.0, le=1.0)
    tags: list[str]
    mcqs: list[GeneratedQuestion] = Field(default_factory=list)
