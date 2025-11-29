"""
Celery tasks for agent response generation in threads.

When a user @mentions an agent in a chat message, these tasks handle:
1. Creating a placeholder response message
2. Building the agent with appropriate context
3. Generating the response with streaming updates via WebSocket
4. Updating the message with final content
"""

import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer

from opencontractserver.conversations.models import MessageStateChoices, MessageType

logger = logging.getLogger(__name__)


def get_thread_channel_group(conversation_id: int) -> str:
    """Get the channel group name for a conversation/thread."""
    return f"thread_{conversation_id}"


def broadcast_to_thread(conversation_id: int, message_type: str, data: dict) -> None:
    """
    Broadcast a message to all WebSocket consumers watching a thread.

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
    from opencontractserver.llms import agents as agent_factory

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
            msg_type=MessageType.LLM,
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

        # 3. Gather context from thread
        thread_messages = (
            ChatMessage.objects.filter(
                conversation=conversation,
                deleted_at__isnull=True,
            )
            .exclude(pk=response_message.pk)
            .order_by("created_at")[:50]  # Limit context window
        )

        # Convert to agent message format
        context_messages = []
        for msg in thread_messages:
            role = "user" if msg.msg_type == MessageType.HUMAN else "assistant"
            context_messages.append({"role": role, "content": msg.content})

        # 4. Build the agent based on context
        if corpus:
            # Corpus-scoped agent
            agent = agent_factory.for_corpus(
                corpus_pk=corpus.pk,
                user_id=user.pk,
                system_instructions=agent_config.system_instructions,
                available_tools=agent_config.available_tools,
            )
        else:
            # Document-scoped or generic agent
            # For now, use corpus agent with no corpus (limited tools)
            agent = agent_factory.for_corpus(
                corpus_pk=None,
                user_id=user.pk,
                system_instructions=agent_config.system_instructions,
                available_tools=agent_config.available_tools,
            )

        # 5. Generate response with streaming
        accumulated_content = ""
        sources_data = []
        timeline_data = []

        # The agent.astream_events() is async, but we're in a sync Celery task
        # We need to run the async generator synchronously
        import asyncio

        async def run_agent():
            nonlocal accumulated_content

            async for event in agent.astream_events(
                {"messages": context_messages},
                version="v2",
            ):
                event_kind = event.get("event")
                event_data = event.get("data", {})

                # Handle different event types
                if event_kind == "on_chat_model_stream":
                    chunk = event_data.get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        token = chunk.content
                        accumulated_content += token

                        # Broadcast token
                        broadcast_to_thread(
                            conversation_id,
                            "agent.stream_token",
                            {
                                "message_id": str(response_message.pk),
                                "token": token,
                            },
                        )

                elif event_kind == "on_tool_start":
                    tool_name = event_data.get("name", "unknown")
                    tool_input = event_data.get("input", {})
                    timeline_data.append(
                        {
                            "type": "tool_call",
                            "tool": tool_name,
                            "args": tool_input,
                        }
                    )
                    broadcast_to_thread(
                        conversation_id,
                        "agent.tool_call",
                        {
                            "message_id": str(response_message.pk),
                            "tool": tool_name,
                            "args": tool_input,
                        },
                    )

                elif event_kind == "on_tool_end":
                    tool_output = event_data.get("output", "")
                    timeline_data.append(
                        {
                            "type": "tool_result",
                            "result": str(tool_output)[:500],  # Truncate
                        }
                    )

        # Run the async generator
        try:
            asyncio.run(run_agent())
        except Exception as agent_error:
            logger.exception(f"[AgentTask] Agent execution error: {agent_error}")
            accumulated_content = (
                f"I encountered an error while processing: {str(agent_error)}"
            )

        # 6. Update message with final content
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

        # Update message state to failed if it was created
        if response_message:
            response_message.state = MessageStateChoices.FAILED
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
