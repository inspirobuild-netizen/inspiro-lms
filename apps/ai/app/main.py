import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import get_settings
from .llm.embeddings_client import shutdown_embeddings
from .llm.groq_client import shutdown_groq
from .routers import coach, content, current_affairs, doubts, embeddings, exams

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("inspiro-ai")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if not settings.groq_api_key:
        logger.warning("GROQ_API_KEY not set — LLM calls will fail")
    if not settings.internal_api_key:
        logger.warning("INTERNAL_API_KEY not set — all requests will be rejected (503)")
    yield
    await shutdown_groq()
    await shutdown_embeddings()


app = FastAPI(
    title="Inspiro AI Service",
    version="0.1.0",
    lifespan=lifespan,
    # Internal service — no public docs in production
    docs_url="/docs" if get_settings().environment != "production" else None,
    redoc_url=None,
)

app.include_router(doubts.router)
app.include_router(exams.router)
app.include_router(current_affairs.router)
app.include_router(coach.router)
app.include_router(content.router)
app.include_router(embeddings.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "inspiro-ai"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak stack traces to callers
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
