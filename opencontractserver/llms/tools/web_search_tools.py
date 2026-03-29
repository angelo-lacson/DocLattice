"""
Web search tool for OpenContracts agents.

Provides a performant async web search capability with pluggable provider
backends. Secrets (API keys) are stored in PipelineSettings encrypted_secrets
under the ``tool:web_search`` namespace.

Supported providers:
  - **Brave Search** (default) — comprehensive web results via Brave Search API
  - **Tavily** — AI-optimised search returning clean, structured results

Adding a new provider
---------------------
1. Subclass ``SearchProvider`` and implement ``search()``.
2. Register the subclass in ``_PROVIDERS``.
3. Add the provider identifier to ``opencontractserver.constants.web_search``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from opencontractserver.constants.web_search import (
    BRAVE_PROVIDER,
    BRAVE_SEARCH_ENDPOINT,
    DEFAULT_WEB_SEARCH_PROVIDER,
    TAVILY_PROVIDER,
    TAVILY_SEARCH_ENDPOINT,
    WEB_SEARCH_CONNECT_TIMEOUT_SECONDS,
    WEB_SEARCH_DEFAULT_NUM_RESULTS,
    WEB_SEARCH_MAX_NUM_RESULTS,
    WEB_SEARCH_MAX_SNIPPET_CHARS,
    WEB_SEARCH_MAX_TOTAL_CHARS,
    WEB_SEARCH_RATE_LIMIT_PER_MINUTE,
    WEB_SEARCH_REQUEST_TIMEOUT_SECONDS,
    WEB_SEARCH_SETTINGS_KEY,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Data structures
# ============================================================================


@dataclass(frozen=True)
class SearchResult:
    """A single web search result."""

    title: str
    url: str
    snippet: str
    # Optional enrichments from certain providers
    published_date: str = ""
    source: str = ""

    def format(self, index: int) -> str:
        """Format for LLM consumption."""
        snippet = self.snippet
        if len(snippet) > WEB_SEARCH_MAX_SNIPPET_CHARS:
            snippet = snippet[: WEB_SEARCH_MAX_SNIPPET_CHARS - 3] + "..."

        parts = [f"### Result {index}"]
        parts.append(f"**{self.title}**")
        parts.append(f"URL: {self.url}")
        if self.published_date:
            parts.append(f"Published: {self.published_date}")
        if self.source:
            parts.append(f"Source: {self.source}")
        parts.append(f"\n{snippet}")
        return "\n".join(parts)


# ============================================================================
# Rate limiter (token-bucket, per-process)
# ============================================================================


class _RateLimiter:
    """Simple sliding-window rate limiter for outbound API calls."""

    def __init__(self, max_per_minute: int = WEB_SEARCH_RATE_LIMIT_PER_MINUTE):
        self._max = max_per_minute
        self._timestamps: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Block until a request slot is available."""
        async with self._lock:
            now = time.monotonic()
            # Evict timestamps older than 60 s
            cutoff = now - 60.0
            self._timestamps = [t for t in self._timestamps if t > cutoff]

            if len(self._timestamps) >= self._max:
                # Wait until the oldest slot expires
                wait = 60.0 - (now - self._timestamps[0])
                if wait > 0:
                    await asyncio.sleep(wait)
                self._timestamps.pop(0)

            self._timestamps.append(time.monotonic())


# One limiter per provider, lazily created
_limiters: dict[str, _RateLimiter] = {}


def _get_limiter(provider: str) -> _RateLimiter:
    if provider not in _limiters:
        _limiters[provider] = _RateLimiter()
    return _limiters[provider]


# ============================================================================
# Provider abstraction
# ============================================================================


class SearchProvider(ABC):
    """Abstract base for web search providers."""

    @abstractmethod
    async def search(
        self,
        query: str,
        num_results: int,
        api_key: str,
        search_type: str = "general",
    ) -> list[SearchResult]:
        """Execute a search and return structured results."""
        ...


class BraveSearchProvider(SearchProvider):
    """Brave Search API provider.

    Docs: https://api.search.brave.com/app/documentation/web-search
    """

    async def search(
        self,
        query: str,
        num_results: int,
        api_key: str,
        search_type: str = "general",
    ) -> list[SearchResult]:
        import httpx

        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": api_key,
        }
        params: dict[str, Any] = {
            "q": query,
            "count": min(num_results, WEB_SEARCH_MAX_NUM_RESULTS),
        }
        if search_type == "news":
            params["news"] = "true"

        timeout = httpx.Timeout(
            WEB_SEARCH_REQUEST_TIMEOUT_SECONDS,
            connect=WEB_SEARCH_CONNECT_TIMEOUT_SECONDS,
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                BRAVE_SEARCH_ENDPOINT,
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

        results: list[SearchResult] = []
        web_results = data.get("web", {}).get("results", [])
        for item in web_results[:num_results]:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("description", ""),
                    published_date=item.get("page_age", ""),
                    source=item.get("meta_url", {}).get("hostname", ""),
                )
            )
        return results


class TavilySearchProvider(SearchProvider):
    """Tavily Search API provider — optimised for AI agent consumption.

    Docs: https://docs.tavily.com/
    """

    async def search(
        self,
        query: str,
        num_results: int,
        api_key: str,
        search_type: str = "general",
    ) -> list[SearchResult]:
        import httpx

        payload: dict[str, Any] = {
            "api_key": api_key,
            "query": query,
            "max_results": min(num_results, WEB_SEARCH_MAX_NUM_RESULTS),
            "search_depth": "advanced" if search_type == "research" else "basic",
            "include_answer": False,
        }
        if search_type == "news":
            payload["topic"] = "news"

        timeout = httpx.Timeout(
            WEB_SEARCH_REQUEST_TIMEOUT_SECONDS,
            connect=WEB_SEARCH_CONNECT_TIMEOUT_SECONDS,
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                TAVILY_SEARCH_ENDPOINT,
                json=payload,
                timeout=timeout,
            )
            resp.raise_for_status()
            data = resp.json()

        results: list[SearchResult] = []
        for item in data.get("results", [])[:num_results]:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("content", ""),
                    published_date=item.get("published_date", ""),
                    source=(
                        item.get("url", "").split("/")[2]
                        if "/" in item.get("url", "")
                        else ""
                    ),
                )
            )
        return results


# Provider registry
_PROVIDERS: dict[str, SearchProvider] = {
    BRAVE_PROVIDER: BraveSearchProvider(),
    TAVILY_PROVIDER: TavilySearchProvider(),
}


# ============================================================================
# Settings retrieval helpers
# ============================================================================


def _get_web_search_settings() -> dict[str, Any]:
    """Retrieve web search tool settings from PipelineSettings singleton.

    Returns a dict that may contain:
      - ``api_key``: The API key for the configured provider
      - ``provider``: Provider identifier (``brave`` or ``tavily``)
    """
    from opencontractserver.documents.models import PipelineSettings

    ps = PipelineSettings.get_instance()
    return ps.get_tool_settings(WEB_SEARCH_SETTINGS_KEY)


# ============================================================================
# Async tool function (registered in FUNCTION_MAP)
# ============================================================================


async def aweb_search(
    query: str,
    num_results: int = WEB_SEARCH_DEFAULT_NUM_RESULTS,
    search_type: str = "general",
) -> str:
    """
    Search the web for information relevant to the query.

    Returns formatted results including titles, URLs, and content snippets.
    Useful for finding recent information, verifying facts, or researching
    topics not covered in the loaded documents.

    Args:
        query: The search query. Be specific for better results.
        num_results: Number of results to return (1-20, default 5).
        search_type: Type of search — "general" (default), "news", or
                     "research" (deeper analysis, Tavily only).

    Returns:
        Formatted search results with titles, URLs, and snippets.
    """
    from asgiref.sync import sync_to_async

    # Validate inputs
    if not query or not query.strip():
        return "Error: search query cannot be empty."

    num_results = max(1, min(num_results, WEB_SEARCH_MAX_NUM_RESULTS))

    if search_type not in ("general", "news", "research"):
        search_type = "general"

    # Load settings (DB access via sync_to_async)
    settings = await sync_to_async(_get_web_search_settings)()

    api_key = settings.get("api_key", "")
    if not api_key:
        return (
            "Error: web search is not configured. An administrator must set "
            "the API key via Pipeline Settings > Tool Secrets (key: "
            f"'{WEB_SEARCH_SETTINGS_KEY}')."
        )

    provider_name = settings.get("provider", DEFAULT_WEB_SEARCH_PROVIDER)
    provider = _PROVIDERS.get(provider_name)
    if provider is None:
        return (
            f"Error: unknown search provider '{provider_name}'. "
            f"Supported: {', '.join(_PROVIDERS.keys())}."
        )

    # Rate limiting
    limiter = _get_limiter(provider_name)
    await limiter.acquire()

    # Execute search
    try:
        results = await provider.search(
            query=query.strip(),
            num_results=num_results,
            api_key=api_key,
            search_type=search_type,
        )
    except Exception as e:
        logger.exception(
            "Web search failed for query=%r provider=%s", query, provider_name
        )
        return f"Error: web search failed — {type(e).__name__}: {e}"

    if not results:
        return f"No results found for: {query}"

    # Format results
    parts = [f"## Web Search Results for: {query}\n"]
    total_chars = 0
    for i, result in enumerate(results, 1):
        formatted = result.format(i)
        if total_chars + len(formatted) > WEB_SEARCH_MAX_TOTAL_CHARS:
            parts.append(
                f"\n*[Results truncated — {len(results) - i + 1} additional "
                f"results omitted to save context]*"
            )
            break
        parts.append(formatted)
        total_chars += len(formatted)

    parts.append(f"\n---\n*Provider: {provider_name} | Results: {len(results)}*")
    return "\n\n".join(parts)


# ============================================================================
# Sync wrapper for tests only — NOT registered in ToolFunctionRegistry
# ============================================================================


def web_search(
    query: str,
    num_results: int = WEB_SEARCH_DEFAULT_NUM_RESULTS,
    search_type: str = "general",
) -> str:
    """Sync test-only wrapper. Do NOT use in production."""
    import asyncio

    return asyncio.run(
        aweb_search(query=query, num_results=num_results, search_type=search_type)
    )
