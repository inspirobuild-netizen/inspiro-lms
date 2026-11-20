from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All settings come from env vars — never hardcode secrets."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Groq
    groq_api_key: str = ""
    # Groq retires models without notice — llama-3.3-70b-versatile started
    # returning 404 "model does not exist", which silently broke every AI
    # feature (coach, doubts, exam generation, current affairs) at once.
    # Chosen over gpt-oss-120b for rate-limit headroom: the 120b hit a 429 on
    # its second call, and current-affairs ingestion makes dozens per run.
    # Verify a replacement with response_format=json_object before switching —
    # everything here depends on JSON mode.
    groq_model: str = "openai/gpt-oss-20b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    # Roughly where groq_model's knowledge ends. The doubt tutor is told this,
    # and tells the student when an answer may have changed since.
    groq_knowledge_cutoff: str = "mid-2024"
    # Doubts can run on their own model (empty = groq_model). Groq's limits are
    # per model, so a student's doubt then does not queue behind the daily
    # current-affairs run; and a fresher model gives fewer answers that were
    # true two years ago. In Nov 2026 qwen/qwen3.8-27b named the RBI Governor
    # and the CEC appointed since 2024 and got 8/8 fixed UPSC facts, where
    # gpt-oss-20b got 5/8 and failed JSON once. If this model fails, the doubt
    # is retried on groq_model.
    groq_doubt_model: str = ""
    groq_doubt_knowledge_cutoff: str = ""

    # Embeddings — any OpenAI-compatible /embeddings endpoint.
    # Default: Jina (cheapest stable provider). Swap providers by changing
    # these three env vars; keep dim at 1024 to match the pgvector column.
    embeddings_base_url: str = "https://api.jina.ai/v1"
    embeddings_api_key: str = ""
    embeddings_model: str = "jina-embeddings-v3"
    embeddings_dim: int = 1024

    # Internal auth — the Node API must send this key on every request
    internal_api_key: str = ""

    # Server
    port: int = 8000
    environment: str = "development"

    # Limits
    max_context_chars: int = 12_000
    llm_timeout_seconds: float = 45.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
