from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All settings come from env vars — never hardcode secrets."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Groq
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_base_url: str = "https://api.groq.com/openai/v1"

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
