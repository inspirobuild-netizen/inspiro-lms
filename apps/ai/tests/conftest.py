import os

# Must be set before app.config is imported anywhere (get_settings is cached)
os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("EMBEDDINGS_API_KEY", "test-embeddings-key")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Internal-Key": "test-internal-key"}


class FakeGroq:
    """Stands in for GroqClient — returns a canned dict per test."""

    def __init__(self, response: dict):
        self.response = response
        self.calls: list[tuple[str, str]] = []

    async def chat_json(self, system: str, user: str, **kwargs) -> dict:
        self.calls.append((system, user))
        return self.response


@pytest.fixture
def mock_groq(monkeypatch):
    def _install(response: dict) -> FakeGroq:
        fake = FakeGroq(response)
        modules = (
            "app.routers.doubts",
            "app.routers.exams",
            "app.routers.current_affairs",
            "app.routers.coach",
            "app.routers.content",
        )
        for module in modules:
            monkeypatch.setattr(f"{module}.get_groq", lambda fake=fake: fake)
        return fake

    return _install
