# Backend WebSocket Implementation

**Last Updated:** 2026-01-09

## Overview

The backend WebSocket implementation consists of Django Channels consumers that handle real-time chat functionality, thread updates, and notifications. The consumers serve different contexts:

| Consumer | Purpose | URL Pattern |
|----------|---------|-------------|
| **DocumentQueryConsumer** | Document-specific conversations (with corpus context) | `ws/document/<document_id>/query/corpus/<corpus_id>/` |
| **CorpusQueryConsumer** | Corpus-wide conversations | `ws/corpus/<corpus_id>/query/` |
| **StandaloneDocumentQueryConsumer** | Document conversations without corpus | `ws/standalone/document/<document_id>/query/` |
| **UnifiedAgentConsumer** | Unified agent chat (preferred for new integrations) | `ws/agent-chat/?corpus_id=X&document_id=X` |
| **ThreadUpdatesConsumer** | Real-time thread/conversation updates | `ws/thread-updates/?conversation_id=X` |
| **NotificationUpdatesConsumer** | Real-time user notifications | `ws/notification-updates/` |

## Architecture

### Consumer Base Pattern

All consumers inherit from `AsyncWebsocketConsumer` and implement:

1. **Connection lifecycle management**
2. **Authentication and authorization**
3. **Agent lifecycle management**
4. **Message processing and streaming**
5. **Error handling and logging**

### Agent Integration

Consumers use the unified LLM agent API (`opencontractserver.llms.agents`) which provides:

- Framework-agnostic agent creation
- Conversation persistence
- Streaming response handling
- Tool approval workflows

## DocumentQueryConsumer

**Location:** `config/websocket/consumers/document_conversation.py`

### Connection Flow

```python
async def connect(self) -> None:
    # 1. Generate unique session ID
    self.session_id = str(uuid.uuid4())

    # 2. Authenticate user
    if not self.scope["user"].is_authenticated:
        await self.close(code=4000)
        return

    # 3. Extract and validate corpus/document IDs
    graphql_corpus_id = extract_websocket_path_id(self.scope["path"], "corpus")
    graphql_doc_id = extract_websocket_path_id(self.scope["path"], "document")

    # 4. Load database records
    self.corpus = await Corpus.objects.aget(id=self.corpus_id)
    self.document = await Document.objects.aget(id=self.document_id)

    # 5. Accept connection
    await self.accept()
```

### Agent Creation

Agents are created lazily on first query:

```python
# Parse optional conversation ID from query string
query_params = urllib.parse.parse_qs(query_string)
conversation_id = query_params.get("load_from_conversation_id", [None])[0]

# Create agent with context
agent_kwargs = {
    "document": self.document,
    "corpus": self.corpus,
    "user_id": self.scope["user"].id,
}

if conversation_id:
    agent_kwargs["conversation_id"] = int(from_global_id(conversation_id)[1])

self.agent = await agents.for_document(
    **agent_kwargs,
    framework=settings.LLMS_DEFAULT_AGENT_FRAMEWORK
)
```

### Message Processing

The `receive()` method handles incoming messages:

```python
async def receive(self, text_data: str) -> None:
    # 1. Parse JSON payload
    text_data_json = json.loads(text_data)

    # 2. Handle approval decisions
    if "approval_decision" in text_data_json:
        await self._handle_approval_decision(text_data_json)
        return

    # 3. Extract user query
    user_query = text_data_json.get("query", "").strip()

    # 4. Create agent if needed
    if self.agent is None:
        # Agent creation logic...

    # 5. Stream response
    async for event in self.agent.stream(user_query):
        # Event processing logic...
```

### Event Processing

The consumer maps agent events to WebSocket messages:

```python
# Content streaming
if isinstance(event, ContentEvent):
    await self.send_standard_message(
        msg_type="ASYNC_CONTENT",
        content=event.content,
        data={"message_id": event.llm_message_id},
    )

# Source citations
elif isinstance(event, SourceEvent):
    await self.send_standard_message(
        msg_type="ASYNC_SOURCES",
        content="",
        data={
            "message_id": event.llm_message_id,
            "sources": [s.to_dict() for s in event.sources],
        },
    )

# Tool approval requests
elif isinstance(event, ApprovalNeededEvent):
    await self.send_standard_message(
        msg_type="ASYNC_APPROVAL_NEEDED",
        content="",
        data={
            "message_id": event.llm_message_id,
            "pending_tool_call": event.pending_tool_call,
        },
    )
```

### Approval Workflow

The approval system allows users to authorize tool execution:

```python
async def _handle_approval_decision(self, payload: dict[str, Any]) -> None:
    approved = bool(payload.get("approval_decision"))
    llm_msg_id = payload.get("llm_message_id")

    # Resume agent with approval decision
    async for event in self.agent.resume_with_approval(
        llm_msg_id, approved, stream=True
    ):
        # Process resumed events...
```

## CorpusQueryConsumer

**Location:** `config/websocket/consumers/corpus_conversation.py`

### Key Differences from Document Consumer

1. **Simpler path structure**: Only requires corpus ID
2. **Corpus-level agent**: Uses `agents.for_corpus()` factory
3. **No approval workflow**: Corpus queries typically don't require tool approval
4. **Embedder configuration**: Respects corpus `preferred_embedder` setting

### Connection Flow

```python
async def connect(self) -> None:
    # 1. Authenticate user
    if not self.scope["user"].is_authenticated:
        await self.close(code=4000)
        return

    # 2. Extract and validate corpus ID
    graphql_corpus_id = extract_websocket_path_id(self.scope["path"], "corpus")
    self.corpus_id = int(from_global_id(graphql_corpus_id)[1])
    self.corpus = await Corpus.objects.aget(id=self.corpus_id)

    # 3. Accept connection
    await self.accept()
```

### Agent Creation

```python
agent_kwargs = {
    "corpus": self.corpus_id,
    "user_id": self.scope["user"].id,
}

if conversation_id:
    agent_kwargs["conversation_id"] = conversation_id

if getattr(self.corpus, "preferred_embedder", None):
    agent_kwargs["embedder"] = self.corpus.preferred_embedder

self.agent = await agents.for_corpus(
    **agent_kwargs,
    framework=settings.LLMS_DEFAULT_AGENT_FRAMEWORK
)
```

## Common Utilities

### Path ID Extraction

Both consumers use `extract_websocket_path_id()` to parse GraphQL IDs from URLs:

```python
from config.websocket.utils.extract_ids import extract_websocket_path_id

# Extract from path like "/ws/corpus/Q29ycHVzOjE=/document/RG9jdW1lbnQ6MQ==/"
corpus_id = extract_websocket_path_id(path, "corpus")
doc_id = extract_websocket_path_id(path, "document")
```

### Standard Message Format

Both consumers use `send_standard_message()` for consistent output:

```python
async def send_standard_message(
    self,
    msg_type: MessageType,
    content: str = "",
    data: dict[str, Any] | None = None,
) -> None:
    await self.send(
        json.dumps({
            "type": msg_type,
            "content": content,
            "data": data or {},
        })
    )
```

## Error Handling

### Connection Errors

```python
try:
    # Connection logic...
except (ValueError, Corpus.DoesNotExist):
    await self.accept()
    await self.send_standard_message(
        msg_type="SYNC_CONTENT",
        content="",
        data={"error": "Invalid or missing corpus_id"},
    )
    await self.close(code=4000)
```

### Processing Errors

```python
try:
    # Message processing...
except Exception as e:
    logger.error(f"[Session {self.session_id}] Error: {e}", exc_info=True)
    await self.send_standard_message(
        msg_type="SYNC_CONTENT",
        content="",
        data={"error": f"Error during processing: {e}"},
    )
```

## Logging Strategy

### Session-Based Logging

All log messages include session IDs for traceability:

```python
logger.debug(f"[Session {self.session_id}] Agent created for doc {self.document_id}")
logger.error(f"[Session {self.session_id}] Error during API call: {str(e)}", exc_info=True)
```

### Log Levels

- **DEBUG**: Connection events, agent creation, message flow
- **INFO**: Successful operations, conversation lifecycle
- **WARNING**: Unexpected but handled conditions
- **ERROR**: Failures requiring investigation

### Consumer Lifecycle Logging

```python
def __init__(self, *args, **kwargs):
    super().__init__(*args, **kwargs)
    self.consumer_id = uuid.uuid4()
    logger.debug(f"[Consumer {self.consumer_id}] __init__ called.")

async def disconnect(self, close_code: int) -> None:
    logger.debug(f"[Consumer {self.consumer_id} | Session {self.session_id}] disconnect() called.")
    self.agent = None  # Clean up for GC
```

## Performance Considerations

### Resource Management

1. **Agent Reuse**: Agents persist for the WebSocket session duration
2. **Lazy Loading**: Agents created only when first query arrives
3. **Memory Cleanup**: Agents nullified on disconnect for garbage collection
4. **Database Efficiency**: Uses async ORM methods for non-blocking I/O

### Streaming Efficiency

1. **Event-Driven**: Uses async generators for memory-efficient streaming
2. **Backpressure**: Natural flow control via WebSocket buffering
3. **Early Sources**: Citations sent as soon as available
4. **Progressive Display**: Content streams immediately without buffering

## Configuration

### Django Settings

```python
# Agent framework selection
LLMS_DEFAULT_AGENT_FRAMEWORK = "pydantic_ai"  # or another defined framework enum

# OpenAI API configuration
OPENAI_API_KEY = "sk-..."

# Channels configuration
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        # Redis config...
    },
}
```

### URL Routing

WebSocket consumers are registered in Django Channels routing:

```python
# config/routing.py
from django.urls import path
from config.websocket.consumers import DocumentQueryConsumer, CorpusQueryConsumer

websocket_urlpatterns = [
    path("ws/corpus/<str:corpus_id>/document/<str:document_id>/", DocumentQueryConsumer.as_asgi()),
    path("ws/corpus/<str:corpus_id>/", CorpusQueryConsumer.as_asgi()),
]
```

## Testing Considerations

### Unit Testing

Consumers can be tested using Django Channels testing utilities:

```python
from channels.testing import WebsocketCommunicator
from myapp.consumers import DocumentQueryConsumer

async def test_document_consumer():
    communicator = WebsocketCommunicator(DocumentQueryConsumer.as_asgi(), "/ws/test/")
    connected, subprotocol = await communicator.connect()
    assert connected

    # Send test message
    await communicator.send_json_to({"query": "test question"})

    # Receive response
    response = await communicator.receive_json_from()
    assert response["type"] == "ASYNC_START"

    await communicator.disconnect()
```

### Integration Testing

End-to-end tests should verify:

1. Authentication and authorization
2. Message flow completeness
3. Error handling behavior
4. Agent state persistence
5. Database record creation

## StandaloneDocumentQueryConsumer

**Source:** [`config/websocket/consumers/standalone_document_conversation.py`](../../../config/websocket/consumers/standalone_document_conversation.py)

Provides a WebSocket consumer for querying documents WITHOUT a corpus context. This allows users to chat with documents directly, without requiring them to be part of a corpus.

### Key Differences from DocumentQueryConsumer

1. **No corpus_id in the WebSocket path** - Uses `/ws/standalone/document/<document_id>/query/`
2. **Supports both authenticated and anonymous users** - Anonymous access allowed for public documents
3. **Automatically filters out corpus-dependent tools** - Only document-specific tools available
4. **Uses embedder fallback strategy** - Picks existing embedder from document annotations or falls back to default

### Connection Flow

1. Extract document_id from path
2. Fetch document from database
3. Check permissions (authenticated users) or public access (anonymous)
4. Accept connection

### Features

- Automatic conversation title generation for new conversations
- Tool approval workflow support
- Streaming response handling with all standard event types

---

## UnifiedAgentConsumer

**Source:** [`config/websocket/consumers/unified_agent_conversation.py`](../../../config/websocket/consumers/unified_agent_conversation.py)

A single WebSocket consumer that handles all agent conversation contexts. This DRY refactoring consolidates ~1500 lines of duplicated code into a single, maintainable consumer that supports dynamic agent selection.

**Recommended for new integrations.**

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `corpus_id` | One of corpus_id or document_id | GraphQL ID for corpus context |
| `document_id` | One of corpus_id or document_id | GraphQL ID for document context |
| `conversation_id` | No | GraphQL ID for existing conversation |
| `agent_id` | No | GraphQL ID for specific agent (uses default if omitted) |

### Agent Selection Logic

1. If `agent_id` provided: Use that specific agent configuration
2. If `document_id` provided: Use `default-document-agent` (GLOBAL)
3. If `corpus_id` provided: Use `default-corpus-agent` (GLOBAL)
4. Otherwise: Reject connection (no context)

### Features

- Supports all conversation contexts (corpus, document, standalone document)
- Dynamic agent configuration via `AgentConfiguration` model
- Full tool approval workflow
- Handles all standard agent events (ContentEvent, SourceEvent, ApprovalNeededEvent, etc.)

---

## ThreadUpdatesConsumer

**Source:** [`config/websocket/consumers/thread_updates.py`](../../../config/websocket/consumers/thread_updates.py)

WebSocket consumer for real-time thread/conversation updates. Clients subscribe to receive:

- Agent response streaming tokens
- Tool call notifications
- Response completion events
- Error notifications

**This consumer is read-only** - it only broadcasts updates from Celery tasks. The actual agent responses are generated by the `generate_agent_response` task.

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `conversation_id` | Yes | GraphQL ID for the conversation to watch |

### Channel Layer Events

The consumer handles these channel layer messages from Celery tasks:

| Event | Handler Method | Description |
|-------|----------------|-------------|
| `agent_stream_start` | `agent_stream_start()` | Agent starting to generate response |
| `agent_stream_token` | `agent_stream_token()` | Streaming token from agent |
| `agent_tool_call` | `agent_tool_call()` | Agent calling a tool |
| `agent_stream_complete` | `agent_stream_complete()` | Agent finished response |
| `agent_stream_error` | `agent_stream_error()` | Error during generation |

### Message Types (Server to Client)

- `CONNECTED` - Connection established with conversation_id and session_id
- `AGENT_STREAM_START` - Agent started generating (includes agent metadata)
- `AGENT_STREAM_TOKEN` - Individual token from streaming response
- `AGENT_TOOL_CALL` - Agent invoked a tool
- `AGENT_STREAM_COMPLETE` - Full response with content, sources, timeline
- `AGENT_STREAM_ERROR` - Error occurred during generation

### Client Messages

- `ping` - Returns `pong` for connection health check
- `heartbeat` - Returns `heartbeat_ack` with session_id

### Permission Model

For conversations with BOTH `chat_with_corpus` AND `chat_with_document` set (doc-in-corpus threads), user must have access to BOTH the corpus AND the document (AND logic).

---

## NotificationUpdatesConsumer

**Source:** [`config/websocket/consumers/notification_updates.py`](../../../config/websocket/consumers/notification_updates.py)

WebSocket consumer for real-time notification updates. Clients subscribe to receive instant notifications about:

- Badge awards (BADGE)
- Message replies (REPLY, THREAD_REPLY)
- Mentions (MENTION)
- Accepted answers (ACCEPTED)
- Moderation actions (THREAD_LOCKED, MESSAGE_DELETED, etc.)

**This consumer is read-only** - it only broadcasts updates when notifications are created or updated via signals.

Related to **Issue #637**: Migrate badge notifications from polling to WebSocket/SSE.

### Connection

No query parameters required - uses authenticated user from WebSocket auth middleware.

**URL:** `ws://localhost:8000/ws/notification-updates/`

### Security

- **User-specific channel groups**: `notification_user_{user_id}`
- **IDOR prevention**: Only shows notifications for authenticated user
- **Token validation**: Via WebSocket auth middleware
- Rejects unauthenticated connections (code 4001)

### Channel Layer Events

| Event | Handler Method | Description |
|-------|----------------|-------------|
| `notification_created` | `notification_created()` | New notification created |
| `notification_updated` | `notification_updated()` | Notification read status changed |
| `notification_deleted` | `notification_deleted()` | Notification deleted |

### Message Types (Server to Client)

- `CONNECTED` - Connection established with user_id and session_id
- `NOTIFICATION_CREATED` - New notification with full details
- `NOTIFICATION_UPDATED` - Read status change
- `NOTIFICATION_DELETED` - Notification removed

### Client Messages

- `ping` - Returns `pong` for connection health check
- `heartbeat` - Returns `heartbeat_ack` with session_id

---

## Related Files

- [`config/asgi.py`](../../../config/asgi.py): WebSocket URL routing configuration
- [`opencontractserver/llms/agents/`](../../../opencontractserver/llms/agents/): Agent implementations
- [`opencontractserver/conversations/models.py`](../../../opencontractserver/conversations/models.py): Database models
- [`config/websocket/utils/`](../../../config/websocket/utils/): Utility functions (auth helpers, ID extraction)
- [`config/websocket/middleware.py`](../../../config/websocket/middleware.py): WebSocket authentication middleware
