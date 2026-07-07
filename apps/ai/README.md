# Inspiro AI Service

Python FastAPI microservice for AI features. Called only by the Node API
(service-to-service auth via `X-Internal-Key`) — never exposed publicly.

## Endpoints

| Route | Purpose |
|---|---|
| `POST /ai/doubts/resolve` | Answer a student doubt with confidence score; `escalate: true` below 0.55 |
| `POST /ai/exams/generate` | Generate MCQ paper (topic, difficulty, UPSC/PSC style) |
| `POST /ai/current-affairs/summarize` | Exam-oriented summary + tags + MCQs from an article |
| `GET /health` | Liveness |

## Dev

```powershell
cd apps/ai
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
copy .env.example .env   # fill GROQ_API_KEY + INTERNAL_API_KEY
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

## Test / Lint

```powershell
.venv\Scripts\python -m pytest tests -q
.venv\Scripts\python -m ruff check app tests
```

## Docker

```bash
docker build -t inspiro-ai apps/ai
docker run -p 8000:8000 --env-file apps/ai/.env inspiro-ai
```
