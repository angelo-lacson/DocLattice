"""
Celery tasks for agent memory curation.

When a conversation goes idle in a memory-enabled corpus, these tasks:
1. Summarise the conversation (privacy-preserving)
2. Feed the summary to a curation LLM that updates the corpus memory document
3. Mark the conversation as curated so it is not processed again
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from opencontractserver.constants.agent_memory import (
    MEMORY_CURATION_BATCH_LIMIT,
    MEMORY_CURATION_IDLE_MINUTES,
    MEMORY_CURATION_MAX_CONVERSATION_TOKENS,
    MEMORY_CURATION_MIN_MESSAGES,
    MEMORY_MAX_INSIGHTS_PER_CURATION,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Conversation summarisation prompt (privacy firewall)
# ---------------------------------------------------------------------------
_SUMMARISE_SYSTEM_PROMPT = """\
You are summarising a conversation for memory curation purposes.
Focus ONLY on:
- Types of questions asked (not the specific questions)
- Search strategies and tool usage patterns that were effective or ineffective
- Document structure patterns discovered during the conversation
- Common topics and what approaches worked well

Do NOT include:
- Specific user questions or answers
- Personal information about users
- Specific data values, quotes, or excerpts from documents
- Anything that could identify the user or their specific inquiry

Output a concise summary (under 500 words) of the patterns and strategies \
observed in the conversation."""

_SUMMARISE_USER_PROMPT = """\
Summarise the following conversation for memory curation:

{conversation_text}"""


# ---------------------------------------------------------------------------
# Core curation task
# ---------------------------------------------------------------------------


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def curate_corpus_memory(
    self,
    conversation_id: int,
) -> dict:
    """Reflect on a completed conversation and update corpus memory.

    This task:
    1. Loads the conversation and validates eligibility
    2. Generates a privacy-safe summary of the conversation
    3. Calls the curation LLM to propose memory updates
    4. Merges updates into the memory document
    5. Marks the conversation as curated

    Returns:
        Dict with curation outcome metadata.
    """
    return async_to_sync(_curate_corpus_memory_async)(conversation_id)


async def _curate_corpus_memory_async(conversation_id: int) -> dict:
    """Async implementation of corpus memory curation."""
    from channels.db import database_sync_to_async
    from pydantic_ai.agent import Agent as PydanticAIAgent

    from opencontractserver.agents.memory import (
        build_curation_prompt,
        merge_curation_into_memory,
        read_memory_content,
        update_memory_content,
    )
    from opencontractserver.conversations.models import (
        Conversation,
        ConversationTypeChoices,
    )
    from opencontractserver.llms.context_guardrails import estimate_token_count

    # 1. Load conversation and validate
    try:
        conversation = await Conversation.objects.select_related(
            "chat_with_corpus", "creator"
        ).aget(id=conversation_id)
    except Conversation.DoesNotExist:
        logger.warning("Conversation %s not found for curation", conversation_id)
        return {"status": "skipped", "reason": "conversation_not_found"}

    if conversation.memory_curated:
        return {"status": "skipped", "reason": "already_curated"}

    corpus = conversation.chat_with_corpus
    if not corpus or not corpus.memory_enabled:
        return {"status": "skipped", "reason": "memory_not_enabled"}

    # Only curate CHAT conversations (agent interactions), not threads
    if conversation.conversation_type != ConversationTypeChoices.CHAT:
        return {"status": "skipped", "reason": "not_chat_type"}

    # 2. Load messages and check minimum threshold BEFORE claiming.
    # This avoids permanently marking short conversations as curated,
    # which would prevent re-evaluation if more messages are added later.
    messages = await database_sync_to_async(
        lambda: list(
            conversation.chat_messages.filter(deleted_at__isnull=True)
            .order_by("created_at")
            .values_list("msg_type", "content", named=True)
        )
    )()

    if len(messages) < MEMORY_CURATION_MIN_MESSAGES:
        return {"status": "skipped", "reason": "too_few_messages"}

    # Atomically claim this conversation to prevent duplicate dispatches.
    # If another task already set memory_curated=True, updated will be 0.
    updated = await database_sync_to_async(
        lambda: Conversation.objects.filter(
            pk=conversation.pk, memory_curated=False
        ).update(memory_curated=True)
    )()
    if not updated:
        return {"status": "skipped", "reason": "already_claimed"}

    # 3. Build conversation text (truncated to budget)
    conversation_lines = []
    for msg in messages:
        role = (
            msg.msg_type.upper()
            if hasattr(msg.msg_type, "upper")
            else str(msg.msg_type)
        )
        content = msg.content or ""
        conversation_lines.append(f"[{role}]: {content}")

    conversation_text = "\n".join(conversation_lines)
    if (
        estimate_token_count(conversation_text)
        > MEMORY_CURATION_MAX_CONVERSATION_TOKENS
    ):
        # Truncate from the beginning, keep most recent messages
        while (
            estimate_token_count(conversation_text)
            > MEMORY_CURATION_MAX_CONVERSATION_TOKENS
            and len(conversation_lines) > MEMORY_CURATION_MIN_MESSAGES
        ):
            conversation_lines.pop(0)
        conversation_text = "[Earlier messages truncated]\n" + "\n".join(
            conversation_lines
        )

    # 4. Stage 1: Summarise conversation (privacy firewall)
    model_name = settings.OPENAI_MODEL
    summarise_agent = PydanticAIAgent(
        model=model_name,
        instructions=_SUMMARISE_SYSTEM_PROMPT,
    )

    # Helper to release the claim on error so the task can be retried
    async def _release_claim():
        await database_sync_to_async(
            lambda: Conversation.objects.filter(pk=conversation.pk).update(
                memory_curated=False
            )
        )()

    try:
        summary_result = await summarise_agent.run(
            _SUMMARISE_USER_PROMPT.format(conversation_text=conversation_text)
        )
        conversation_summary = str(summary_result.output)
    except Exception:
        logger.warning(
            "Failed to summarise conversation %s for curation",
            conversation_id,
            exc_info=True,
        )
        await _release_claim()
        return {"status": "error", "reason": "summarisation_failed"}

    # 5. Stage 2: Read current memory and curate
    current_memory = await read_memory_content(corpus)
    system_prompt, user_prompt = build_curation_prompt(
        current_memory=current_memory,
        conversation_text=conversation_summary,
        max_insights=MEMORY_MAX_INSIGHTS_PER_CURATION,
    )

    curation_agent = PydanticAIAgent(
        model=model_name,
        instructions=system_prompt,
    )
    try:
        curation_result = await curation_agent.run(user_prompt)
        raw_output = str(curation_result.output)
    except Exception:
        logger.warning(
            "Failed to curate memory for conversation %s",
            conversation_id,
            exc_info=True,
        )
        await _release_claim()
        return {"status": "error", "reason": "curation_llm_failed"}

    # 6. Parse curation output and merge into memory
    try:
        # Try to parse as JSON
        curation_data = json.loads(raw_output)
        collection_patterns = curation_data.get("collection_patterns", [])
        query_patterns = curation_data.get("query_patterns", [])
        refinements = curation_data.get("refinements", [])

        updated_content = merge_curation_into_memory(
            current_content=current_memory,
            collection_patterns=collection_patterns,
            query_patterns=query_patterns,
            refinements=refinements,
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        logger.warning(
            "Curation LLM returned non-JSON output for conversation %s, "
            "skipping merge",
            conversation_id,
        )
        await _release_claim()
        return {"status": "error", "reason": "invalid_curation_output"}

    # 7. Write updated memory
    user = conversation.creator
    await update_memory_content(corpus, updated_content, user)

    logger.info(
        "Curated memory for corpus %s from conversation %s: "
        "+%d collection, +%d query, %d refinements",
        corpus.id,
        conversation_id,
        len(collection_patterns),
        len(query_patterns),
        len(refinements),
    )

    return {
        "status": "success",
        "conversation_id": conversation_id,
        "corpus_id": corpus.id,
        "new_collection_patterns": len(collection_patterns),
        "new_query_patterns": len(query_patterns),
        "refinements": len(refinements),
    }


# ---------------------------------------------------------------------------
# Periodic checker — finds idle conversations eligible for curation
# ---------------------------------------------------------------------------


@shared_task
def check_conversations_for_curation() -> dict:
    """Periodic task to find idle conversations ready for memory curation.

    Dispatches ``curate_corpus_memory`` for each eligible conversation.
    """
    from opencontractserver.conversations.models import (
        Conversation,
        ConversationTypeChoices,
    )

    cutoff = timezone.now() - timedelta(minutes=MEMORY_CURATION_IDLE_MINUTES)

    eligible = (
        Conversation.objects.filter(
            memory_curated=False,
            conversation_type=ConversationTypeChoices.CHAT,
            chat_with_corpus__memory_enabled=True,
            chat_with_corpus__isnull=False,
        )
        .filter(
            # Last modified before the idle cutoff
            modified__lt=cutoff,
        )
        .order_by("modified")
        .values_list("id", flat=True)[:MEMORY_CURATION_BATCH_LIMIT]
    )

    dispatched = 0
    for conv_id in eligible:
        curate_corpus_memory.delay(conv_id)
        dispatched += 1

    if dispatched:
        logger.info("Dispatched memory curation for %d idle conversations", dispatched)

    return {"dispatched": dispatched}
