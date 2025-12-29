"""
Celery tasks for agent response generation in threads.

When a user @mentions an agent in a chat message, these tasks handle:
1. Creating a placeholder response message
2. Building the agent with appropriate context
3. Generating the response with streaming updates via WebSocket
4. Updating the message with final content
"""

import asyncio
import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer

from opencontractserver.conversations.models import (
    MessageStateChoices,
    MessageTypeChoices,
)

logger = logging.getLogger(__name__)


def get_thread_channel_group(conversation_id: int) -> str:
    """Get the channel group name for a conversation/thread."""
    return f"thread_{conversation_id}"


def broadcast_to_thread(conversation_id: int, message_type: str, data: dict) -> None:
    """
    Broadcast a message to all WebSocket consumers watching a thread (sync version).

    Args:
        conversation_id: The conversation ID
        message_type: Type of message (e.g., 'agent.stream', 'agent.complete')
        data: Message payload
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured - skipping WebSocket broadcast")
        return

    group_name = get_thread_channel_group(conversation_id)
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": message_type.replace(".", "_"),  # Django Channels convention
            **data,
        },
    )


async def async_broadcast_to_thread(
    conversation_id: int, message_type: str, data: dict
) -> None:
    """
    Broadcast a message to all WebSocket consumers watching a thread (async version).

    Args:
        conversation_id: The conversation ID
        message_type: Type of message (e.g., 'agent.stream', 'agent.complete')
        data: Message payload
    """
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning("No channel layer configured - skipping WebSocket broadcast")
        return

    group_name = get_thread_channel_group(conversation_id)
    await channel_layer.group_send(
        group_name,
        {
            "type": message_type.replace(".", "_"),  # Django Channels convention
            **data,
        },
    )


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def generate_agent_response(
    self,
    source_message_id: int,
    agent_config_id: int,
    user_id: int,
) -> dict:
    """
    Generate an agent response to a message that mentioned the agent.

    This task:
    1. Creates a placeholder LLM message in 'in_progress' state
    2. Loads the agent configuration and builds the agent
    3. Gathers thread context (previous messages)
    4. Generates response using the agent
    5. Updates the message with final content
    6. Broadcasts updates via WebSocket

    Args:
        source_message_id: ID of the message that mentioned the agent
        agent_config_id: ID of the AgentConfiguration to use
        user_id: ID of the user who triggered the response

    Returns:
        dict with 'status', 'message_id', and optional 'error'
    """
    from django.contrib.auth import get_user_model

    from opencontractserver.agents.models import AgentConfiguration
    from opencontractserver.conversations.models import ChatMessage
    from opencontractserver.llms.agents.core_agents import (
        ContentEvent,
        FinalEvent,
        SourceEvent,
        ThoughtEvent,
    )
    from opencontractserver.llms.api import agents as agent_api

    User = get_user_model()

    response_message = None
    conversation_id = None

    try:
        # 1. Load entities
        user = User.objects.get(pk=user_id)
        source_message = ChatMessage.objects.select_related(
            "conversation", "conversation__chat_with_corpus"
        ).get(pk=source_message_id)
        agent_config = AgentConfiguration.objects.get(pk=agent_config_id)
        conversation = source_message.conversation
        conversation_id = conversation.pk
        corpus = conversation.chat_with_corpus

        logger.info(
            f"[AgentTask] Generating response for message {source_message_id} "
            f"with agent '{agent_config.name}' (id={agent_config_id})"
        )

        # 2. Create placeholder response message
        response_message = ChatMessage.objects.create(
            conversation=conversation,
            msg_type=MessageTypeChoices.LLM,
            agent_configuration=agent_config,
            content="",  # Will be filled during streaming
            parent_message=source_message,
            state=MessageStateChoices.IN_PROGRESS,
            creator=user,
        )

        # Broadcast start event
        broadcast_to_thread(
            conversation_id,
            "agent.stream_start",
            {
                "message_id": str(response_message.pk),
                "agent_id": str(agent_config_id),
                "agent_name": agent_config.name,
                "agent_slug": agent_config.slug,
            },
        )

        # 3. Get the user's message content
        user_message = source_message.content

        # 4. Generate response with streaming
        accumulated_content = ""
        sources_data = []
        timeline_data = []

        async def run_agent():
            nonlocal accumulated_content

            # Build the agent - for_corpus is async
            if corpus:
                agent = await agent_api.for_corpus(
                    corpus=corpus,
                    user_id=user.pk,
                    system_prompt=agent_config.system_instructions,
                    conversation=conversation,
                )
            else:
                # No corpus context - create a minimal agent
                # This shouldn't normally happen for thread agents
                logger.warning(
                    f"[AgentTask] No corpus found for conversation {conversation_id}"
                )
                agent = await agent_api.for_corpus(
                    corpus=1,  # Fallback - will need proper handling
                    user_id=user.pk,
                    system_prompt=agent_config.system_instructions,
                    conversation=conversation,
                )

            # Stream the agent response
            # Pass store_messages=False since we handle message persistence ourselves
            # (we already created response_message above with parent_message set)
            async for event in agent.stream(user_message, store_messages=False):
                if isinstance(event, ContentEvent):
                    # Token/content chunk
                    token = event.content
                    accumulated_content = event.accumulated_content or (
                        accumulated_content + token
                    )

                    # Broadcast token (use async version inside async context)
                    await async_broadcast_to_thread(
                        conversation_id,
                        "agent.stream_token",
                        {
                            "message_id": str(response_message.pk),
                            "token": token,
                        },
                    )

                elif isinstance(event, ThoughtEvent):
                    # Agent thinking/tool usage
                    thought = event.thought
                    metadata = event.metadata or {}
                    tool_name = metadata.get("tool_name")

                    if tool_name:
                        timeline_data.append(
                            {
                                "type": "tool_call",
                                "tool": tool_name,
                                "thought": thought,
                            }
                        )
                        await async_broadcast_to_thread(
                            conversation_id,
                            "agent.tool_call",
                            {
                                "message_id": str(response_message.pk),
                                "tool": tool_name,
                                "thought": thought,
                            },
                        )
                    else:
                        timeline_data.append(
                            {
                                "type": "thought",
                                "thought": thought,
                            }
                        )

                elif isinstance(event, SourceEvent):
                    # Sources discovered
                    if event.sources:
                        for source in event.sources:
                            sources_data.append(source.to_dict())

                elif isinstance(event, FinalEvent):
                    # Final event - use its content if we don't have accumulated
                    if event.content and not accumulated_content:
                        accumulated_content = event.content
                    if event.sources:
                        for source in event.sources:
                            if source.to_dict() not in sources_data:
                                sources_data.append(source.to_dict())

        # Run the async generator
        try:
            asyncio.run(run_agent())
        except Exception as agent_error:
            logger.exception(f"[AgentTask] Agent execution error: {agent_error}")
            # Only overwrite content if we have nothing useful
            if not accumulated_content.strip():
                accumulated_content = (
                    f"I encountered an error while processing: {str(agent_error)}"
                )
            else:
                # Append error notice to partial content
                accumulated_content += (
                    "\n\n---\n*Note: Response may be incomplete due to an error.*"
                )

        # 5. Update message with final content
        response_message.content = accumulated_content
        response_message.state = MessageStateChoices.COMPLETED
        response_message.data = {
            "sources": sources_data,
            "timeline": timeline_data,
        }
        response_message.save(update_fields=["content", "state", "data"])

        # Broadcast completion
        broadcast_to_thread(
            conversation_id,
            "agent.stream_complete",
            {
                "message_id": str(response_message.pk),
                "content": accumulated_content,
                "sources": sources_data,
                "timeline": timeline_data,
            },
        )

        logger.info(
            f"[AgentTask] Successfully generated response for message {source_message_id}"
        )

        return {
            "status": "success",
            "message_id": response_message.pk,
            "content_length": len(accumulated_content),
        }

    except User.DoesNotExist:
        logger.error(f"[AgentTask] User not found: {user_id}")
        return {"status": "error", "error": "User not found"}

    except ChatMessage.DoesNotExist:
        logger.error(f"[AgentTask] Source message not found: {source_message_id}")
        return {"status": "error", "error": "Source message not found"}

    except AgentConfiguration.DoesNotExist:
        logger.error(f"[AgentTask] Agent config not found: {agent_config_id}")
        return {"status": "error", "error": "Agent configuration not found"}

    except Exception as e:
        logger.exception(f"[AgentTask] Unexpected error: {e}")

        # Update message state to error if it was created
        if response_message:
            response_message.state = MessageStateChoices.ERROR
            response_message.content = f"Error generating response: {str(e)}"
            response_message.save(update_fields=["state", "content"])

            # Broadcast error
            if conversation_id:
                broadcast_to_thread(
                    conversation_id,
                    "agent.stream_error",
                    {
                        "message_id": str(response_message.pk),
                        "error": str(e),
                    },
                )

        # Retry on transient errors
        try:
            raise self.retry(exc=e)
        except self.MaxRetriesExceededError:
            return {"status": "error", "error": str(e)}


@shared_task
def trigger_agent_responses_for_message(message_id: int, user_id: int) -> dict:
    """
    Check a message for agent mentions and trigger responses for each.

    This is called after a message is created to handle @agent mentions.

    Args:
        message_id: ID of the newly created message
        user_id: ID of the user who created the message

    Returns:
        dict with 'agents_triggered' count and list of 'task_ids'
    """
    from opencontractserver.conversations.models import ChatMessage

    try:
        message = ChatMessage.objects.prefetch_related("mentioned_agents").get(
            pk=message_id
        )
    except ChatMessage.DoesNotExist:
        logger.error(f"[AgentTask] Message not found for trigger: {message_id}")
        return {"agents_triggered": 0, "task_ids": [], "error": "Message not found"}

    mentioned_agents = message.mentioned_agents.filter(is_active=True)

    if not mentioned_agents.exists():
        logger.debug(f"[AgentTask] No active agents mentioned in message {message_id}")
        return {"agents_triggered": 0, "task_ids": []}

    task_ids = []
    for agent in mentioned_agents:
        task = generate_agent_response.delay(
            source_message_id=message_id,
            agent_config_id=agent.pk,
            user_id=user_id,
        )
        task_ids.append(task.id)
        logger.info(
            f"[AgentTask] Triggered response task {task.id} for agent '{agent.name}'"
        )

    return {
        "agents_triggered": len(task_ids),
        "task_ids": task_ids,
    }


# --------------------------------------------------------------------------- #
# Agent-based Corpus Actions
# --------------------------------------------------------------------------- #


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_agent_corpus_action(
    self,
    corpus_action_id: int,
    document_id: int,
    user_id: int,
    execution_id: int | None = None,
) -> dict:
    """
    Execute an agent-based corpus action on a single document.

    This task runs synchronously but internally uses asyncio to call
    the async agent API. It's triggered when a document is added or edited
    in a corpus that has an agent-based corpus action configured.

    Args:
        corpus_action_id: ID of the CorpusAction to execute
        document_id: ID of the Document to process
        user_id: ID of the User triggering the action
        execution_id: Optional ID of CorpusActionExecution record for tracking

    Returns:
        dict with status information and result_id
    """
    import traceback

    from django.utils import timezone

    from opencontractserver.agents.models import AgentActionResult
    from opencontractserver.corpuses.models import CorpusActionExecution

    logger.info(
        f"[AgentCorpusAction] Starting: action={corpus_action_id}, "
        f"doc={document_id}, user={user_id}, execution={execution_id}"
    )

    # Mark execution as started if tracking
    execution = None
    if execution_id:
        try:
            execution = CorpusActionExecution.objects.get(id=execution_id)
            execution.mark_started()
        except CorpusActionExecution.DoesNotExist:
            logger.warning(f"[AgentCorpusAction] Execution {execution_id} not found")

    try:
        result = asyncio.run(
            _run_agent_corpus_action_async(
                corpus_action_id=corpus_action_id,
                document_id=document_id,
                user_id=user_id,
            )
        )

        # Mark execution as completed
        if execution:
            affected_objects = [{"type": "agent_result", "id": result.get("result_id")}]
            if result.get("conversation_id"):
                affected_objects.append(
                    {"type": "conversation", "id": result.get("conversation_id")}
                )
            execution.mark_completed(
                affected_objects=affected_objects,
                metadata={
                    "response_length": result.get("response_length"),
                    "status": result.get("status"),
                },
            )

            # Link to agent result
            if result.get("result_id"):
                execution.agent_result_id = result.get("result_id")
                execution.save(update_fields=["agent_result"])

        return result

    except Exception as exc:
        logger.error(
            f"[AgentCorpusAction] Failed: action={corpus_action_id}, "
            f"doc={document_id}, error={exc}",
            exc_info=True,
        )

        # Mark execution as failed
        if execution:
            execution.mark_failed(str(exc), traceback.format_exc())

        # Update result record with failure before retrying
        try:
            result, _ = AgentActionResult.objects.get_or_create(
                corpus_action_id=corpus_action_id,
                document_id=document_id,
                defaults={
                    "creator_id": user_id,
                    "status": AgentActionResult.Status.FAILED,
                    "started_at": timezone.now(),
                },
            )
            result.status = AgentActionResult.Status.FAILED
            result.error_message = str(exc)[:1000]  # Truncate to prevent DB bloat
            result.completed_at = timezone.now()
            result.save(update_fields=["status", "error_message", "completed_at"])
        except Exception as e:
            logger.error(f"[AgentCorpusAction] Failed to mark result as failed: {e}")

        raise self.retry(exc=exc)


async def _run_agent_corpus_action_async(
    corpus_action_id: int,
    document_id: int,
    user_id: int,
) -> dict:
    """Async implementation of agent corpus action execution."""
    from channels.db import database_sync_to_async
    from django.conf import settings
    from django.utils import timezone

    from opencontractserver.agents.models import AgentActionResult
    from opencontractserver.corpuses.models import CorpusAction
    from opencontractserver.documents.models import Document
    from opencontractserver.llms import agents

    # Load the action and document
    action = await CorpusAction.objects.select_related("agent_config", "corpus").aget(
        id=corpus_action_id
    )

    document = await Document.objects.aget(id=document_id)

    logger.info(
        f"[AgentCorpusAction] Executing '{action.name}' on document "
        f"'{document.title}' (id={document_id})"
    )

    # Create or get result record with atomic status claiming.
    # Race condition prevention:
    # 1. If record doesn't exist, create with RUNNING status
    # 2. If record exists, atomically try to claim it by updating status to RUNNING
    #    (only if not already RUNNING or COMPLETED)
    # 3. If atomic update fails (0 rows affected), another task owns it - skip
    @database_sync_to_async
    def get_or_create_and_claim():
        # First, try to get or create
        result, created = AgentActionResult.objects.get_or_create(
            corpus_action=action,
            document=document,
            defaults={
                "creator_id": user_id,
                "status": AgentActionResult.Status.RUNNING,
                "started_at": timezone.now(),
            },
        )

        if created:
            # We created it with RUNNING status, we own it
            return result, "created"

        # Record exists - try to atomically claim it
        # Only update if status is NOT already RUNNING or COMPLETED
        claimed = (
            AgentActionResult.objects.filter(
                pk=result.pk,
            )
            .exclude(
                status__in=[
                    AgentActionResult.Status.RUNNING,
                    AgentActionResult.Status.COMPLETED,
                ]
            )
            .update(
                status=AgentActionResult.Status.RUNNING,
                started_at=timezone.now(),
                error_message="",
            )
        )

        if claimed:
            # We successfully claimed it
            result.refresh_from_db()
            return result, "claimed"

        # Couldn't claim - it's RUNNING or COMPLETED
        result.refresh_from_db()
        return result, f"already_{result.status}"

    result, status = await get_or_create_and_claim()

    # Skip if we couldn't claim the record
    if status.startswith("already_"):
        logger.info(f"[AgentCorpusAction] {status} for doc {document_id}, skipping")
        return {"status": status, "result_id": result.id}

    try:
        # Determine which tools to use
        tools = action.pre_authorized_tools or []
        if not tools and action.agent_config:
            tools = action.agent_config.available_tools or []

        # Build system prompt
        system_prompt = None
        if action.agent_config and action.agent_config.system_instructions:
            system_prompt = action.agent_config.system_instructions

        logger.debug(
            f"[AgentCorpusAction] Creating agent with tools={tools}, "
            f"prompt_length={len(action.agent_prompt)}"
        )

        # Create agent with pre-authorization (skip approval gate)
        agent = await agents.for_document(
            document=document,
            corpus=action.corpus,
            user_id=user_id,
            system_prompt=system_prompt,
            tools=tools,
            streaming=False,
            # Pre-authorize all tools for automated execution
            skip_approval_gate=True,
        )

        # Execute the task prompt
        logger.info(f"[AgentCorpusAction] Executing prompt for doc {document_id}")
        response = await agent.chat(action.agent_prompt)

        # Build execution metadata
        execution_metadata = {
            "model": getattr(settings, "LLMS_DEFAULT_MODEL", "unknown"),
            "tools_available": tools,
            "sources_count": len(response.sources) if response.sources else 0,
            "agent_config_id": action.agent_config_id,
            "agent_config_name": (
                action.agent_config.name if action.agent_config else None
            ),
        }

        # Update result with success
        result.status = AgentActionResult.Status.COMPLETED
        result.agent_response = response.content
        result.conversation_id = agent.get_conversation_id()
        result.completed_at = timezone.now()
        result.execution_metadata = execution_metadata

        @database_sync_to_async
        def save_result_completed():
            result.save()

        await save_result_completed()

        logger.info(
            f"[AgentCorpusAction] Completed: action={corpus_action_id}, "
            f"doc={document_id}, result={result.id}, "
            f"response_length={len(response.content)}"
        )

        return {
            "status": "completed",
            "result_id": result.id,
            "response_length": len(response.content),
            "conversation_id": agent.get_conversation_id(),
        }

    except Exception as e:
        # Update result with failure
        result.status = AgentActionResult.Status.FAILED
        # Truncate error message to prevent database bloat from long stack traces
        result.error_message = str(e)[:1000]
        result.completed_at = timezone.now()

        @database_sync_to_async
        def save_result_failed():
            result.save()

        await save_result_failed()

        logger.error(
            f"[AgentCorpusAction] Failed: action={corpus_action_id}, "
            f"doc={document_id}, error={e}",
            exc_info=True,
        )
        raise


# --------------------------------------------------------------------------- #
# Thread/Message Agent-based Corpus Actions
# --------------------------------------------------------------------------- #


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_agent_thread_action(
    self,
    corpus_action_id: int,
    conversation_id: int,
    message_id: int | None,
    user_id: int,
    execution_id: int | None = None,
) -> dict:
    """
    Execute an agent-based corpus action on a thread or message.

    This is the thread/message equivalent of run_agent_corpus_action.
    The agent receives context about the thread/message and can use
    moderation tools to take action.

    Args:
        corpus_action_id: ID of the CorpusAction to execute
        conversation_id: ID of the Conversation (thread) to process
        message_id: Optional ID of the specific message (for NEW_MESSAGE trigger)
        user_id: ID of the User (for audit trail)
        execution_id: Optional ID of CorpusActionExecution for tracking

    Returns:
        dict with status information
    """
    import traceback

    from opencontractserver.corpuses.models import CorpusActionExecution

    logger.info(
        f"[AgentThreadAction] Starting: action={corpus_action_id}, "
        f"conversation={conversation_id}, message={message_id}, user={user_id}"
    )

    # Mark execution as started
    execution = None
    if execution_id:
        try:
            execution = CorpusActionExecution.objects.get(id=execution_id)
            execution.mark_started()
        except CorpusActionExecution.DoesNotExist:
            logger.warning(f"[AgentThreadAction] Execution {execution_id} not found")

    try:
        result = asyncio.run(
            _run_agent_thread_action_async(
                corpus_action_id=corpus_action_id,
                conversation_id=conversation_id,
                message_id=message_id,
                user_id=user_id,
            )
        )

        if execution:
            affected_objects = [{"type": "agent_result", "id": result.get("result_id")}]
            if result.get("conversation_id"):
                affected_objects.append(
                    {"type": "conversation", "id": result.get("conversation_id")}
                )
            execution.mark_completed(
                affected_objects=affected_objects,
                metadata={
                    "response_length": result.get("response_length"),
                    "status": result.get("status"),
                },
            )

            # Link to agent result
            if result.get("result_id"):
                execution.agent_result_id = result.get("result_id")
                execution.save(update_fields=["agent_result"])

        return result

    except Exception as exc:
        logger.error(
            f"[AgentThreadAction] Failed: action={corpus_action_id}, "
            f"conversation={conversation_id}, error={exc}",
            exc_info=True,
        )

        if execution:
            execution.mark_failed(str(exc), traceback.format_exc())

        raise self.retry(exc=exc)


async def _run_agent_thread_action_async(
    corpus_action_id: int,
    conversation_id: int,
    message_id: int | None,
    user_id: int,
) -> dict:
    """Async implementation of agent thread action execution."""
    from channels.db import database_sync_to_async
    from django.conf import settings
    from django.utils import timezone

    from opencontractserver.agents.models import AgentActionResult
    from opencontractserver.conversations.models import ChatMessage, Conversation
    from opencontractserver.corpuses.models import CorpusAction
    from opencontractserver.llms import agents
    from opencontractserver.llms.tools.moderation_tools import (
        aget_message_content,
        aget_thread_context,
        aget_thread_messages,
    )

    # Load action and thread
    action = await CorpusAction.objects.select_related("agent_config", "corpus").aget(
        id=corpus_action_id
    )
    conversation = await Conversation.objects.aget(id=conversation_id)

    message = None
    if message_id:
        message = await ChatMessage.objects.aget(id=message_id)

    logger.info(
        f"[AgentThreadAction] Executing '{action.name}' on thread "
        f"'{conversation.title}' (id={conversation_id})"
    )

    # Build context for the agent
    thread_context = await aget_thread_context(conversation_id)
    recent_messages = await aget_thread_messages(conversation_id, limit=10)

    # Build the prompt with context
    context_parts = [
        "You are reviewing a discussion thread for moderation.",
        "\n## Thread Information:",
        f"- Thread ID: {conversation_id}",
        f"- Title: {thread_context['title']}",
        f"- Creator: {thread_context['creator_username']}",
        f"- Message count: {thread_context['message_count']}",
        f"- Is locked: {thread_context['is_locked']}",
        f"- Is pinned: {thread_context['is_pinned']}",
    ]

    if thread_context.get("corpus_title"):
        context_parts.append(f"- Corpus: {thread_context['corpus_title']}")

    if message_id and message:
        message_content = await aget_message_content(message_id)
        context_parts.extend(
            [
                f"\n## Triggering Message (ID: {message_id}):",
                f"- Author: {message_content['creator_username']}",
                f"- Content:\n{message_content['content']}",
            ]
        )

    context_parts.append("\n## Recent Thread Messages (most recent first):")

    for msg in recent_messages[:5]:
        content_preview = (
            msg["content"][:200] + "..."
            if len(msg["content"]) > 200
            else msg["content"]
        )
        context_parts.append(
            f"- [{msg['creator_username']}] (ID: {msg['id']}): {content_preview}"
        )

    context_parts.append("\n## Your Task:")
    context_parts.append(action.agent_prompt)

    full_prompt = "\n".join(context_parts)

    # Create or claim result record
    @database_sync_to_async
    def get_or_create_result():
        from django.db import transaction

        with transaction.atomic():
            # Try to get existing or create new, with row lock
            try:
                result = AgentActionResult.objects.select_for_update().get(
                    corpus_action=action,
                    triggering_conversation=conversation,
                    triggering_message=message,
                )
                created = False
            except AgentActionResult.DoesNotExist:
                result = AgentActionResult.objects.create(
                    corpus_action=action,
                    triggering_conversation=conversation,
                    triggering_message=message,
                    creator_id=user_id,
                    status=AgentActionResult.Status.RUNNING,
                    started_at=timezone.now(),
                )
                created = True

            if created:
                return result, "created"

            # Try to claim existing record (we hold the lock)
            if result.status not in [
                AgentActionResult.Status.RUNNING,
                AgentActionResult.Status.COMPLETED,
            ]:
                result.status = AgentActionResult.Status.RUNNING
                result.started_at = timezone.now()
                result.error_message = ""
                result.save(update_fields=["status", "started_at", "error_message"])
                return result, "claimed"

            return result, f"already_{result.status}"

    result, status = await get_or_create_result()

    if status.startswith("already_"):
        logger.info(
            f"[AgentThreadAction] {status} for thread {conversation_id}, skipping"
        )
        return {"status": status, "result_id": result.id}

    try:
        # Determine tools - add moderation tools by default for thread actions
        tools = action.pre_authorized_tools or []
        if not tools and action.agent_config:
            tools = action.agent_config.available_tools or []

        # Ensure moderation tools are available for thread actions
        moderation_tools = [
            "get_thread_context",
            "get_thread_messages",
            "get_message_content",
            "delete_message",
            "lock_thread",
            "unlock_thread",
            "add_thread_message",
            "pin_thread",
            "unpin_thread",
        ]
        for tool in moderation_tools:
            if tool not in tools:
                tools.append(tool)

        system_prompt = None
        if action.agent_config and action.agent_config.system_instructions:
            system_prompt = action.agent_config.system_instructions

        logger.debug(
            f"[AgentThreadAction] Creating agent with tools={tools}, "
            f"prompt_length={len(full_prompt)}"
        )

        # Create agent with corpus context and moderation tools
        # Note: We use for_corpus since thread actions are corpus-scoped
        agent = await agents.for_corpus(
            corpus=action.corpus,
            user_id=user_id,
            system_prompt=system_prompt,
            tools=tools,
            streaming=False,
            skip_approval_gate=True,
        )

        # Execute the task prompt
        logger.info(
            f"[AgentThreadAction] Executing prompt for thread {conversation_id}"
        )
        response = await agent.chat(full_prompt)

        # Build execution metadata
        execution_metadata = {
            "model": getattr(settings, "LLMS_DEFAULT_MODEL", "unknown"),
            "tools_available": tools,
            "agent_config_id": action.agent_config_id,
            "agent_config_name": (
                action.agent_config.name if action.agent_config else None
            ),
            "thread_id": conversation_id,
            "message_id": message_id,
        }

        # Update result with success
        result.status = AgentActionResult.Status.COMPLETED
        result.agent_response = response.content
        result.conversation_id = agent.get_conversation_id()
        result.completed_at = timezone.now()
        result.execution_metadata = execution_metadata

        @database_sync_to_async
        def save_result_completed():
            result.save()

        await save_result_completed()

        logger.info(
            f"[AgentThreadAction] Completed: action={corpus_action_id}, "
            f"thread={conversation_id}, result={result.id}, "
            f"response_length={len(response.content)}"
        )

        return {
            "status": "completed",
            "result_id": result.id,
            "response_length": len(response.content),
            "conversation_id": agent.get_conversation_id(),
        }

    except Exception as e:
        result.status = AgentActionResult.Status.FAILED
        result.error_message = str(e)[:1000]
        result.completed_at = timezone.now()

        @database_sync_to_async
        def save_result_failed():
            result.save()

        await save_result_failed()

        logger.error(
            f"[AgentThreadAction] Failed: action={corpus_action_id}, "
            f"thread={conversation_id}, error={e}",
            exc_info=True,
        )
        raise
