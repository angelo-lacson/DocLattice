"""
Agent memory system — per-corpus document-backed memory.

Memory is stored as a first-class markdown Document in the corpus, visible
and editable by users.  Agents accumulate generalizable insights from
conversations into this document, improving responses over time.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from channels.db import database_sync_to_async
from django.core.files.base import ContentFile

from opencontractserver.constants.agent_memory import (
    MEMORY_DOCUMENT_TITLE,
    MEMORY_FULL_INJECTION_MAX_TOKENS,
    MEMORY_INJECTION_PREFIX,
    MEMORY_SECTION_COLLECTION_PATTERNS,
    MEMORY_SECTION_QUERY_PATTERNS,
    MEMORY_SEMANTIC_SEARCH_TOP_K,
)
from opencontractserver.constants.document_processing import MARKDOWN_MIME_TYPE
from opencontractserver.llms.context_guardrails import estimate_token_count

if TYPE_CHECKING:
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Memory document template
# ---------------------------------------------------------------------------

_EMPTY_MEMORY_TEMPLATE = """\
---
version: "1.0"
corpus_id: {corpus_id}
last_curated: null
curation_count: 0
---

## {collection_section}

_No collection patterns recorded yet._

## {query_section}

_No query patterns recorded yet._
"""


def _build_empty_memory(corpus_id: int) -> str:
    """Return the initial content for a new memory document."""
    return _EMPTY_MEMORY_TEMPLATE.format(
        corpus_id=corpus_id,
        collection_section=MEMORY_SECTION_COLLECTION_PATTERNS,
        query_section=MEMORY_SECTION_QUERY_PATTERNS,
    )


# ---------------------------------------------------------------------------
# CRUD operations
# ---------------------------------------------------------------------------


async def get_or_create_memory_document(corpus: Corpus, user) -> Document:
    """Get the existing memory document or create a new empty one.

    If the corpus already has a valid ``memory_document``, return it.
    Otherwise, create a new markdown Document via the corpus's import
    pipeline and link it back to ``corpus.memory_document``.

    Args:
        corpus: The Corpus to get/create memory for.
        user: The user to attribute the document to.

    Returns:
        The memory Document instance.
    """
    # Check if memory_document already exists and is valid
    if corpus.memory_document_id:
        try:
            doc = await database_sync_to_async(lambda: corpus.memory_document)()
            if doc is not None:
                return doc
        except Exception:
            logger.warning(
                "memory_document FK on corpus %s is stale, recreating",
                corpus.id,
            )

    # Create a new memory document
    content = _build_empty_memory(corpus.id).encode("utf-8")
    doc, _status, _path = await database_sync_to_async(corpus.import_content)(
        content=content,
        user=user,
        filename=f"{MEMORY_DOCUMENT_TITLE}.md",
        file_type=MARKDOWN_MIME_TYPE,
        title=MEMORY_DOCUMENT_TITLE,
        description="Accumulated agent insights for this corpus.",
    )

    # Link back to corpus
    corpus.memory_document = doc
    await database_sync_to_async(corpus.save)(update_fields=["memory_document"])

    logger.info("Created memory document %s for corpus %s", doc.id, corpus.id)
    return doc


async def read_memory_content(corpus: Corpus) -> str:
    """Read the current memory document content as text.

    Returns empty string if no memory document exists or it has no content.
    """
    if not corpus.memory_document_id:
        return ""

    def _read():
        doc = corpus.memory_document
        if doc is None or not doc.txt_extract_file:
            return ""
        try:
            with doc.txt_extract_file.open("r") as f:
                return f.read()
        except Exception:
            try:
                content = doc.txt_extract_file.read()
                if isinstance(content, bytes):
                    return content.decode("utf-8", errors="ignore")
                return content
            except Exception:
                logger.warning(
                    "Failed to read memory document for corpus %s",
                    corpus.id,
                )
                return ""

    return await database_sync_to_async(_read)()


async def update_memory_content(corpus: Corpus, new_content: str, user) -> Document:
    """Update the memory document with new content.

    Creates the memory document if it doesn't exist.  Overwrites the
    ``txt_extract_file`` field and updates the frontmatter timestamp.

    Args:
        corpus: The Corpus whose memory to update.
        new_content: The full new markdown content.
        user: The user performing the update.

    Returns:
        The updated Document instance.
    """
    doc = await get_or_create_memory_document(corpus, user)

    def _update():
        doc.txt_extract_file.save(
            f"{MEMORY_DOCUMENT_TITLE}.md",
            ContentFile(new_content.encode("utf-8")),
            save=True,
        )
        return doc

    await database_sync_to_async(_update)()
    logger.info("Updated memory document %s for corpus %s", doc.id, corpus.id)
    return doc


# ---------------------------------------------------------------------------
# Memory retrieval for injection
# ---------------------------------------------------------------------------


def _split_memory_sections(content: str) -> list[str]:
    """Split memory document into sections by ``## `` headers.

    Returns a list of section strings, each starting with its header line.
    The YAML frontmatter (delimited by ``---``) is excluded.
    """
    # Strip YAML frontmatter
    stripped = re.sub(r"^---\s*\n.*?\n---\s*\n", "", content, count=1, flags=re.DOTALL)
    # Split on ## headers, keeping the header with its content
    parts = re.split(r"(?=^## )", stripped.strip(), flags=re.MULTILINE)
    return [p.strip() for p in parts if p.strip()]


async def get_memory_for_injection(corpus: Corpus, query: str = "") -> str:
    """Get memory content formatted for agent system prompt injection.

    Uses a hybrid strategy:
    - If the memory document is small (< ``MEMORY_FULL_INJECTION_MAX_TOKENS``
      estimated tokens), return the full content.
    - If larger, return only the sections most relevant to ``query`` using
      simple keyword overlap scoring (no embedding call needed for this
      lightweight first pass).

    Args:
        corpus: The Corpus to retrieve memory for.
        query: Optional relevance signal (e.g., the user's message or system prompt).

    Returns:
        Formatted memory string ready for injection, or empty string if
        no memory exists or memory is empty.
    """
    content = await read_memory_content(corpus)
    if not content:
        return ""

    # Strip frontmatter for token estimation
    body = re.sub(
        r"^---\s*\n.*?\n---\s*\n", "", content, count=1, flags=re.DOTALL
    ).strip()
    if not body:
        return ""

    # Check for placeholder-only content
    if (
        "_No collection patterns recorded yet._" in body
        and "_No query patterns recorded yet._" in body
    ):
        return ""

    token_count = estimate_token_count(body)

    if token_count <= MEMORY_FULL_INJECTION_MAX_TOKENS:
        # Full injection — include everything
        return body

    # Semantic-lite fallback: score sections by keyword overlap with query
    sections = _split_memory_sections(content)
    if not sections:
        return ""

    if not query:
        # No query signal — return first N sections up to token budget
        result_parts = []
        budget = MEMORY_FULL_INJECTION_MAX_TOKENS
        for section in sections:
            cost = estimate_token_count(section)
            if budget - cost < 0 and result_parts:
                break
            result_parts.append(section)
            budget -= cost
        return "\n\n".join(result_parts)

    # Score by word overlap
    query_words = set(query.lower().split())
    scored = []
    for section in sections:
        section_words = set(section.lower().split())
        overlap = len(query_words & section_words)
        scored.append((overlap, section))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_sections = scored[:MEMORY_SEMANTIC_SEARCH_TOP_K]

    return "\n\n".join(s for _, s in top_sections if s)


def format_memory_for_prompt(memory_content: str) -> str:
    """Wrap memory content with the standard injection prefix.

    Args:
        memory_content: Raw memory content (already filtered/trimmed).

    Returns:
        The formatted block ready to append to a system prompt.
    """
    if not memory_content:
        return ""
    return f"{MEMORY_INJECTION_PREFIX}{memory_content}\n"


# ---------------------------------------------------------------------------
# Curation helpers
# ---------------------------------------------------------------------------

_CURATION_SYSTEM_PROMPT = """\
You are a memory curator for a document analysis system. Your job is to review \
a completed conversation between a user and an AI agent about a document corpus, \
and extract GENERALIZABLE insights that would help future interactions.

RULES:
1. Extract PATTERNS, not specifics. Say "Users often ask about X" NOT "User John asked about X".
2. NEVER include personal information, specific user queries, or conversation details.
3. Focus on: document structure patterns, effective search strategies, common topics, \
domain-specific knowledge discovered during the conversation.
4. DEDUPLICATE: if an insight is already in the existing memory, skip it or refine it.
5. Be concise: each insight should be 1-2 sentences with a bold title prefix.
6. Maximum {max_insights} new insights per curation run.

Format each insight as: - **Title**: Description

EXISTING MEMORY:
{current_memory}

CONVERSATION TO REFLECT ON:
{conversation}
"""

_CURATION_USER_PROMPT = """\
Based on the conversation above, output ONLY a JSON object (no markdown fences) with:
{{
  "collection_patterns": ["- **Title**: insight", ...],
  "query_patterns": ["- **Title**: insight", ...],
  "refinements": [
    {{"existing": "old insight text", "refined": "improved insight text"}},
    ...
  ]
}}

If there are no new insights to add, return empty lists. Be selective — only \
add truly useful, generalizable patterns."""


def build_curation_prompt(
    current_memory: str,
    conversation_text: str,
    max_insights: int,
) -> tuple[str, str]:
    """Build the system and user prompts for memory curation.

    Args:
        current_memory: Current memory document content.
        conversation_text: The conversation to reflect on.
        max_insights: Maximum new insights to extract.

    Returns:
        Tuple of (system_prompt, user_prompt).
    """
    system = _CURATION_SYSTEM_PROMPT.format(
        max_insights=max_insights,
        current_memory=current_memory or "(empty — no existing memory)",
        conversation=conversation_text,
    )
    return system, _CURATION_USER_PROMPT


def merge_curation_into_memory(
    current_content: str,
    collection_patterns: list[str],
    query_patterns: list[str],
    refinements: list[dict],
) -> str:
    """Merge curation results into the existing memory document.

    Appends new insights to the appropriate sections and applies refinements
    to existing entries.  Updates the frontmatter ``last_curated`` and
    ``curation_count``.

    Args:
        current_content: The current memory document markdown.
        collection_patterns: New collection pattern entries to append.
        query_patterns: New query pattern entries to append.
        refinements: List of dicts with ``existing`` and ``refined`` keys.

    Returns:
        The updated memory document content.
    """
    if not collection_patterns and not query_patterns and not refinements:
        return current_content

    result = current_content

    # Apply refinements
    for ref in refinements:
        old = ref.get("existing", "")
        new = ref.get("refined", "")
        if old and new and old in result:
            result = result.replace(old, new)

    # Append new collection patterns
    if collection_patterns:
        marker = f"## {MEMORY_SECTION_COLLECTION_PATTERNS}"
        if marker in result:
            # Remove placeholder text if present
            result = result.replace(
                f"{marker}\n\n_No collection patterns recorded yet._",
                marker,
            )
            # Find the end of the section (next ## or end of document)
            section_end = _find_section_end(result, marker)
            insert_text = "\n" + "\n".join(collection_patterns) + "\n"
            result = result[:section_end] + insert_text + result[section_end:]

    # Append new query patterns
    if query_patterns:
        marker = f"## {MEMORY_SECTION_QUERY_PATTERNS}"
        if marker in result:
            # Remove placeholder text if present
            result = result.replace(
                f"{marker}\n\n_No query patterns recorded yet._",
                marker,
            )
            section_end = _find_section_end(result, marker)
            insert_text = "\n" + "\n".join(query_patterns) + "\n"
            result = result[:section_end] + insert_text + result[section_end:]

    # Update frontmatter timestamps
    now_iso = datetime.now(timezone.utc).isoformat()
    result = re.sub(r"last_curated:.*", f'last_curated: "{now_iso}"', result)
    # Increment curation count
    count_match = re.search(r"curation_count:\s*(\d+)", result)
    if count_match:
        old_count = int(count_match.group(1))
        result = result.replace(
            count_match.group(0),
            f"curation_count: {old_count + 1}",
        )

    return result


def _find_section_end(content: str, section_header: str) -> int:
    """Find the character position where a section ends.

    A section ends at the next ``## `` header or at end of document.
    """
    start = content.index(section_header)
    # Look for the next ## header after this section's header line
    after_header = start + len(section_header)
    next_section = content.find("\n## ", after_header)
    if next_section == -1:
        return len(content)
    return next_section
