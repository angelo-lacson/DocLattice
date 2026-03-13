# Anonymous Ephemeral Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable in-memory multi-turn conversations for anonymous users with accurate timeline display, context tracking, and a hard cutoff when context is exhausted.

**Architecture:** Backend `CoreConversationManager` gets an ephemeral message buffer (list of `SimpleNamespace` objects) when `conversation=None`. The buffer feeds into `_get_message_history()` for accurate context tracking and multi-turn LLM conversation. The WebSocket consumer checks for context exhaustion before each agent call. Frontend fixes timeline storage bugs and adds a "context exhausted" banner with a "Start New Chat" button.

**Tech Stack:** Django Channels (WebSocket), pydantic-ai, React/TypeScript, styled-components

**Spec:** `docs/superpowers/specs/2026-03-13-anonymous-ephemeral-chat-design.md`

---

## Chunk 1: Backend — Ephemeral Message Buffer

### Task 1: Add ephemeral buffer fields to CoreConversationManager

**Files:**
- Modify: `opencontractserver/llms/agents/core_agents.py:1108-1116` (__init__)
- Modify: `opencontractserver/llms/agents/core_agents.py:1181-1204` (create_for_corpus)
- Test: `opencontractserver/tests/test_core_agents.py`

- [ ] **Step 1: Write test for ephemeral buffer initialization**

In `opencontractserver/tests/test_core_agents.py`, add:

```python
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock, AsyncMock
from opencontractserver.llms.agents.core_agents import CoreConversationManager, AgentConfig


@pytest.mark.django_db
class TestEphemeralConversationManager:
    """Tests for in-memory ephemeral conversation tracking (anonymous users)."""

    def _make_ephemeral_manager(self) -> CoreConversationManager:
        """Create an ephemeral manager (conversation=None, as for anonymous users)."""
        config = AgentConfig(
            model_name="gpt-4o",
            store_user_messages=True,
            store_llm_messages=True,
        )
        return CoreConversationManager(None, None, config)

    def test_ephemeral_manager_has_empty_buffer(self):
        mgr = self._make_ephemeral_manager()
        assert mgr._ephemeral_messages == []
        assert mgr._ephemeral_token_estimate == 0
        assert mgr._ephemeral_next_id == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager::test_ephemeral_manager_has_empty_buffer -v`

Expected: FAIL — `_ephemeral_messages` attribute not found.

- [ ] **Step 3: Implement ephemeral buffer fields in __init__**

In `opencontractserver/llms/agents/core_agents.py`, modify `__init__` (line 1108):

```python
def __init__(
    self,
    conversation: Optional[Conversation],
    user_id: Optional[int],
    config: AgentConfig,
):
    self.conversation = conversation
    self.user_id = user_id
    self.config = config

    # Ephemeral in-memory buffer for anonymous sessions (conversation=None).
    # Messages are SimpleNamespace objects with .id, .msg_type, .content, .created
    self._ephemeral_messages: list[SimpleNamespace] = []
    self._ephemeral_token_estimate: int = 0
    self._ephemeral_next_id: int = 1
```

Add import at top of file:

```python
from types import SimpleNamespace
```

- [ ] **Step 4: Update create_for_corpus to enable store flags for ephemeral**

In the same file, modify `create_for_corpus` (line 1196). Change the anonymous block to set store flags to `True` so the stream pipeline calls `store_user_message()` and `create_placeholder_message()`:

```python
if user_id is None or (
    not config.store_user_messages and not config.store_llm_messages
):
    logger.debug(
        f"Creating ephemeral (non-stored) conversation for public/anonymous user on corpus {corpus.id}"
    )
    # Enable store flags so the stream pipeline calls store/complete methods.
    # The methods write to the in-memory buffer, not the DB.
    config.store_user_messages = True
    config.store_llm_messages = True
    # Return manager with no conversation - everything will be in-memory only
    return cls(None, None, config)
```

Apply the same change to `create_for_document` (around line 1132) — it has the same anonymous block with `store_user_messages = False` / `store_llm_messages = False`.

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager::test_ephemeral_manager_has_empty_buffer -v`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add opencontractserver/llms/agents/core_agents.py opencontractserver/tests/test_core_agents.py
git commit -m "Add ephemeral buffer fields to CoreConversationManager for anonymous sessions"
```

---

### Task 2: Implement ephemeral store_user_message and create_placeholder_message

**Files:**
- Modify: `opencontractserver/llms/agents/core_agents.py:483-487` (CoreAgentBase.create_placeholder_message — fix delegation)
- Modify: `opencontractserver/llms/agents/core_agents.py:1308-1330` (CoreConversationManager.create_placeholder_message)
- Modify: `opencontractserver/llms/agents/core_agents.py:1393-1410` (CoreConversationManager.store_user_message)
- Test: `opencontractserver/tests/test_core_agents.py`

- [ ] **Step 1: Write tests for ephemeral message storage**

Add to `TestEphemeralConversationManager` in `opencontractserver/tests/test_core_agents.py`:

```python
    @pytest.mark.asyncio
    async def test_store_user_message_appends_to_buffer(self):
        mgr = self._make_ephemeral_manager()
        msg_id = await mgr.store_user_message("Hello, what is this corpus about?")

        assert msg_id == 1
        assert len(mgr._ephemeral_messages) == 1

        msg = mgr._ephemeral_messages[0]
        assert msg.msg_type == "HUMAN"
        assert msg.content == "Hello, what is this corpus about?"
        assert msg.id == 1
        assert mgr._ephemeral_token_estimate > 0

    @pytest.mark.asyncio
    async def test_create_placeholder_returns_synthetic_id(self):
        mgr = self._make_ephemeral_manager()
        placeholder_id = await mgr.create_placeholder_message("LLM")
        assert placeholder_id == 1
        assert mgr._ephemeral_next_id == 2

    @pytest.mark.asyncio
    async def test_sequential_ids_increment(self):
        mgr = self._make_ephemeral_manager()
        id1 = await mgr.store_user_message("first")
        id2 = await mgr.create_placeholder_message("LLM")
        id3 = await mgr.store_user_message("second")

        assert id1 == 1
        assert id2 == 2
        assert id3 == 3
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -k "store_user_message or placeholder or sequential" -v`

Expected: FAIL — methods still return 0 for ephemeral managers.

- [ ] **Step 3: Implement ephemeral store_user_message**

In `core_agents.py`, replace the `CoreConversationManager.store_user_message` method (line 1393):

```python
async def store_user_message(self, content: str) -> int:
    """Store a user message in the conversation."""
    # For anonymous conversations, append to in-memory buffer
    if not self.conversation:
        from opencontractserver.constants.context_guardrails import (
            CHARS_PER_TOKEN_ESTIMATE,
        )

        msg_id = self._ephemeral_next_id
        self._ephemeral_next_id += 1
        self._ephemeral_messages.append(
            SimpleNamespace(
                id=msg_id,
                msg_type="HUMAN",
                content=content,
                created=timezone.now(),
            )
        )
        self._ephemeral_token_estimate += int(
            len(content) / CHARS_PER_TOKEN_ESTIMATE
        )
        return msg_id

    message = await ChatMessage.objects.acreate(
        conversation=self.conversation,
        content=content,
        msg_type=MessageTypeChoices.HUMAN,
        creator_id=self.user_id,
        data={
            "state": MessageState.COMPLETED,
            "created_at": timezone.now().isoformat(),
        },
        state=MessageStateChoices.COMPLETED,
    )
    return message.id
```

- [ ] **Step 4: Implement ephemeral create_placeholder_message in CoreConversationManager**

Replace `CoreConversationManager.create_placeholder_message` (line 1308):

```python
async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
    """Create a placeholder message with state tracking."""
    # For anonymous conversations, return next synthetic ID
    if not self.conversation:
        msg_id = self._ephemeral_next_id
        self._ephemeral_next_id += 1
        return msg_id

    from opencontractserver.conversations.models import (
        ChatMessage,
    )

    message = await ChatMessage.objects.acreate(
        conversation=self.conversation,
        content="",
        msg_type=msg_type,
        creator_id=self.user_id,
        data={
            "state": MessageState.IN_PROGRESS,
            "created_at": timezone.now().isoformat(),
            "model_name": self.config.model_name,
        },
        state=MessageState.IN_PROGRESS,
    )
    return message.id
```

- [ ] **Step 5: Fix CoreAgentBase.create_placeholder_message to delegate**

**Critical fix**: `CoreAgentBase.create_placeholder_message()` (line 483) has its own anonymous check that returns 0 instead of delegating to the conversation manager. This means `CoreAgentBase.stream()` (line 796) gets `llm_msg_id=0`, which is falsy, so `complete_message` at line 844 (`if llm_msg_id:`) is never called for anonymous users.

Replace the entire method at line 483 to delegate, matching the pattern used by `complete_message` (line 537) and `store_user_message` (line 547):

```python
async def create_placeholder_message(self, msg_type: str = "LLM") -> int:
    """Create a placeholder message and return its ID."""
    return await self.conversation_manager.create_placeholder_message(msg_type)
```

This removes the duplicate anonymous check and lets `CoreConversationManager.create_placeholder_message()` (modified in Step 4) handle ephemeral IDs properly. The synthetic ID (1, 2, 3...) is truthy, so `if llm_msg_id:` at line 844 will now pass and `complete_message` will be called.

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -k "store_user_message or placeholder or sequential" -v`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add opencontractserver/llms/agents/core_agents.py opencontractserver/tests/test_core_agents.py
git commit -m "Implement ephemeral store_user_message and create_placeholder_message"
```

---

### Task 3: Implement ephemeral complete_message, update_message, and get_conversation_messages

**Files:**
- Modify: `opencontractserver/llms/agents/core_agents.py:1241-1260` (get_conversation_messages)
- Modify: `opencontractserver/llms/agents/core_agents.py:1343-1377` (complete_message)
- Modify: `opencontractserver/llms/agents/core_agents.py:1444-1470` (update_message)
- Test: `opencontractserver/tests/test_core_agents.py`

- [ ] **Step 1: Write tests**

Add to `TestEphemeralConversationManager`:

```python
    @pytest.mark.asyncio
    async def test_complete_message_appends_assistant_to_buffer(self):
        mgr = self._make_ephemeral_manager()
        # Create placeholder first (as the stream pipeline does)
        placeholder_id = await mgr.create_placeholder_message("LLM")
        await mgr.complete_message(placeholder_id, "This corpus contains legal documents.")

        assert len(mgr._ephemeral_messages) == 1
        msg = mgr._ephemeral_messages[0]
        assert msg.msg_type == "LLM"
        assert msg.content == "This corpus contains legal documents."
        assert msg.id == placeholder_id
        assert mgr._ephemeral_token_estimate > 0

    @pytest.mark.asyncio
    async def test_update_message_modifies_existing(self):
        mgr = self._make_ephemeral_manager()
        msg_id = await mgr.store_user_message("original text")
        await mgr.update_message(msg_id, "updated text")

        assert len(mgr._ephemeral_messages) == 1
        assert mgr._ephemeral_messages[0].content == "updated text"

    @pytest.mark.asyncio
    async def test_get_conversation_messages_returns_buffer(self):
        mgr = self._make_ephemeral_manager()
        await mgr.store_user_message("Hello")
        placeholder_id = await mgr.create_placeholder_message("LLM")
        await mgr.complete_message(placeholder_id, "Hi there!")

        messages = await mgr.get_conversation_messages()
        assert len(messages) == 2
        assert messages[0].msg_type == "HUMAN"
        assert messages[1].msg_type == "LLM"

    @pytest.mark.asyncio
    async def test_token_estimate_accumulates(self):
        mgr = self._make_ephemeral_manager()
        await mgr.store_user_message("Hello")
        tokens_after_first = mgr._ephemeral_token_estimate

        placeholder_id = await mgr.create_placeholder_message("LLM")
        await mgr.complete_message(placeholder_id, "Hi there, how can I help?")

        assert mgr._ephemeral_token_estimate > tokens_after_first
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -k "complete_message or update_message or get_conversation or token_estimate" -v`

Expected: FAIL

- [ ] **Step 3: Implement ephemeral complete_message**

In `core_agents.py`, update `complete_message` (line 1343). Replace the early return for anonymous:

```python
async def complete_message(
    self,
    message_id: int,
    content: str,
    sources: list[SourceNode] = None,
    metadata: dict[str, Any] = None,
) -> None:
    """Complete a message with content, sources, and metadata in one operation."""

    # For anonymous conversations, append to in-memory buffer
    if not self.conversation:
        from opencontractserver.constants.context_guardrails import (
            CHARS_PER_TOKEN_ESTIMATE,
        )

        self._ephemeral_messages.append(
            SimpleNamespace(
                id=message_id,
                msg_type="LLM",
                content=content,
                created=timezone.now(),
            )
        )
        self._ephemeral_token_estimate += int(
            len(content) / CHARS_PER_TOKEN_ESTIMATE
        )
        return

    message = await ChatMessage.objects.aget(id=message_id)
    # ... rest of existing DB code unchanged ...
```

- [ ] **Step 4: Implement ephemeral update_message**

Update `update_message` (line 1444). Replace the early return for anonymous:

```python
async def update_message(
    self,
    message_id: int,
    content: str,
    sources: list[SourceNode] = None,
    metadata: dict[str, Any] = None,
) -> None:
    """Update an existing message with content, sources, and metadata."""
    # For anonymous conversations, update in-memory buffer
    if not self.conversation:
        from opencontractserver.constants.context_guardrails import (
            CHARS_PER_TOKEN_ESTIMATE,
        )

        for msg in self._ephemeral_messages:
            if msg.id == message_id:
                old_tokens = int(len(msg.content) / CHARS_PER_TOKEN_ESTIMATE)
                msg.content = content
                new_tokens = int(len(content) / CHARS_PER_TOKEN_ESTIMATE)
                self._ephemeral_token_estimate += new_tokens - old_tokens
                break
        return

    message = await ChatMessage.objects.aget(id=message_id)
    # ... rest of existing DB code unchanged ...
```

- [ ] **Step 5: Implement ephemeral get_conversation_messages**

Update `get_conversation_messages` (line 1241):

```python
async def get_conversation_messages(self) -> list:
    """Get messages in the conversation, honouring compaction cutoff."""
    # For anonymous conversations, return in-memory buffer
    if not self.conversation:
        return list(self._ephemeral_messages)

    qs = ChatMessage.objects.filter(conversation=self.conversation)
    cutoff = self.conversation.compacted_before_message_id
    if cutoff is not None:
        qs = qs.filter(id__gt=cutoff)

    return [msg async for msg in qs.order_by("created")]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -v`

Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add opencontractserver/llms/agents/core_agents.py opencontractserver/tests/test_core_agents.py
git commit -m "Implement ephemeral complete_message, update_message, and get_conversation_messages"
```

---

### Task 4: Add context_exhausted property

**Files:**
- Modify: `opencontractserver/llms/agents/core_agents.py` (add property after __init__)
- Test: `opencontractserver/tests/test_core_agents.py`

- [ ] **Step 1: Write tests**

Add to `TestEphemeralConversationManager`:

```python
    def test_context_not_exhausted_initially(self):
        mgr = self._make_ephemeral_manager()
        assert mgr.context_exhausted is False

    @pytest.mark.asyncio
    async def test_context_exhausted_when_buffer_large(self):
        mgr = self._make_ephemeral_manager()
        # Fill buffer with enough text to exceed 90% of model context window.
        # gpt-4o has 128000 token context window.
        # At 3.5 chars/token, we need ~128000 * 3.5 * 0.9 = ~403,200 chars.
        large_text = "x" * 410_000
        await mgr.store_user_message(large_text)
        assert mgr.context_exhausted is True

    def test_context_not_exhausted_for_db_conversations(self):
        """context_exhausted should always be False for DB-backed conversations."""
        from unittest.mock import MagicMock

        config = AgentConfig(model_name="gpt-4o")
        mock_conversation = MagicMock()
        mgr = CoreConversationManager(mock_conversation, 1, config)
        assert mgr.context_exhausted is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -k "context_exhausted or context_not_exhausted" -v`

Expected: FAIL — `context_exhausted` property not found.

- [ ] **Step 3: Implement context_exhausted property**

Add after `__init__` in `CoreConversationManager`:

```python
@property
def context_exhausted(self) -> bool:
    """Check if ephemeral context is exhausted (anonymous sessions only).

    Returns True when estimated token usage exceeds 90% of the model's
    context window. Always returns False for DB-backed conversations
    (which use compaction instead).
    """
    if self.conversation is not None:
        return False

    from opencontractserver.llms.context_guardrails import (
        get_context_window_for_model,
    )

    context_window = get_context_window_for_model(self.config.model_name)
    return self._ephemeral_token_estimate > context_window * 0.9
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -k "context_exhausted or context_not_exhausted" -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add opencontractserver/llms/agents/core_agents.py opencontractserver/tests/test_core_agents.py
git commit -m "Add context_exhausted property to CoreConversationManager"
```

---

### Task 5: Guard ephemeral complete_message against None message_id

**Files:**
- Modify: `opencontractserver/llms/agents/core_agents.py` (complete_message ephemeral branch)
- Test: `opencontractserver/tests/test_core_agents.py`

**Context — the double-write problem**:

`CoreAgentBase.stream()` creates IDs via `create_placeholder_message()` (line 796) and later calls `complete_message(llm_msg_id, ...)` (line 844). But `_stream_raw()` is called at line 803 *without* passing those IDs. Inside `PydanticAICoreAgent._stream_core()`, the guard at line 561 (`if self.conversation_manager.conversation and llm_msg_id is None:`) correctly skips deduplication for ephemeral (conversation is None), so `llm_msg_id` stays `None` inside `_stream_core`. At line 1215, `_finalise_llm_message(None, content, ...)` calls `complete_message(None, content, ...)`.

Without a guard, this would append a message with `id=None` to the ephemeral buffer. Then `CoreAgentBase.stream()` at line 844 would append *another* message with the correct synthetic ID — causing a double-write.

**Fix**: The `_stream_core()` guard at line 561 should be **left unchanged**. Instead, make the ephemeral `complete_message` branch skip when `message_id` is `None` (or `0`). `CoreAgentBase.stream()` will then correctly finalize the message with the real synthetic ID.

- [ ] **Step 1: Write test for complete_message with None message_id**

Add to `TestEphemeralConversationManager`:

```python
    @pytest.mark.asyncio
    async def test_complete_message_skips_none_message_id(self):
        """complete_message(None, ...) should be a no-op for ephemeral.

        PydanticAICoreAgent._stream_core() calls _finalise_llm_message(None, ...)
        because it doesn't receive the synthetic ID from CoreAgentBase.stream().
        The real finalization happens when CoreAgentBase.stream() calls
        complete_message(synthetic_id, ...) at line 844.
        """
        mgr = self._make_ephemeral_manager()
        await mgr.complete_message(None, "This should be ignored")

        assert len(mgr._ephemeral_messages) == 0
        assert mgr._ephemeral_token_estimate == 0

    @pytest.mark.asyncio
    async def test_complete_message_skips_zero_message_id(self):
        """complete_message(0, ...) should also be a no-op for ephemeral."""
        mgr = self._make_ephemeral_manager()
        await mgr.complete_message(0, "This should be ignored")

        assert len(mgr._ephemeral_messages) == 0
        assert mgr._ephemeral_token_estimate == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -k "skips_none or skips_zero" -v`

Expected: FAIL — ephemeral `complete_message` currently appends regardless of message_id.

- [ ] **Step 3: Add guard to ephemeral complete_message**

In the ephemeral branch of `complete_message` (Task 3's code), add a check at the top:

```python
    # For anonymous conversations, append to in-memory buffer
    if not self.conversation:
        from opencontractserver.constants.context_guardrails import (
            CHARS_PER_TOKEN_ESTIMATE,
        )

        # Skip if message_id is None or 0 — this happens when
        # _stream_core() calls _finalise_llm_message() without the
        # synthetic ID. CoreAgentBase.stream() will call us again
        # with the real synthetic ID at line 844.
        if not message_id:
            return

        self._ephemeral_messages.append(
            SimpleNamespace(
                id=message_id,
                msg_type="LLM",
                content=content,
                created=timezone.now(),
            )
        )
        self._ephemeral_token_estimate += int(
            len(content) / CHARS_PER_TOKEN_ESTIMATE
        )
        return
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py::TestEphemeralConversationManager -v`

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add opencontractserver/llms/agents/core_agents.py opencontractserver/tests/test_core_agents.py
git commit -m "Guard ephemeral complete_message against None/0 message_id from _stream_core"
```

---

## Chunk 2: Backend — WebSocket Consumer Cutoff

### Task 6: Add context exhaustion check to WebSocket consumer

**Files:**
- Modify: `config/websocket/consumers/unified_agent_conversation.py:412-419` (receive method)
- Test: `opencontractserver/tests/websocket/test_unified_agent_consumer.py`

- [ ] **Step 1: Write test for context exhaustion cutoff**

Add a new test class to `opencontractserver/tests/websocket/test_unified_agent_consumer.py` (or create the file if it doesn't exist). If the existing test infrastructure is too complex to unit-test the consumer directly, write a focused integration test:

```python
@pytest.mark.django_db
@pytest.mark.asyncio
class TestContextExhaustionCutoff:
    """Test that the consumer rejects messages when ephemeral context is full."""

    async def test_context_exhausted_sends_error(self):
        """When context_exhausted is True, consumer should send ASYNC_ERROR
        with error_type CONTEXT_EXHAUSTED instead of running the agent."""
        from unittest.mock import AsyncMock, MagicMock, patch

        consumer = UnifiedAgentConsumer()
        consumer.session_id = "test-session"

        # Mock agent with exhausted context
        mock_manager = MagicMock()
        mock_manager.context_exhausted = True
        mock_agent = MagicMock()
        mock_agent.conversation_manager = mock_manager
        consumer.agent = mock_agent

        consumer._send_safe = AsyncMock()
        consumer._stream_agent_response = AsyncMock()

        # Simulate receiving a message
        await consumer.receive(json.dumps({"query": "Hello"}))

        # Should have sent CONTEXT_EXHAUSTED error
        consumer._send_safe.assert_called_once()
        call_kwargs = consumer._send_safe.call_args[1]
        assert call_kwargs["msg_type"] == "ASYNC_ERROR"
        assert call_kwargs["data"]["error_type"] == "CONTEXT_EXHAUSTED"

        # Should NOT have called the agent
        consumer._stream_agent_response.assert_not_called()
```

Note: Adjust imports and setup based on the existing test patterns in the file. The test may need additional mocking of `self.scope`, `self.channel_layer`, etc. Check the existing test file for the pattern used.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/websocket/test_unified_agent_consumer.py::TestContextExhaustionCutoff -v`

Expected: FAIL — no cutoff check exists yet.

- [ ] **Step 3: Implement cutoff check**

In `unified_agent_conversation.py`, modify `receive()` method. Add after line 412 (`await self._initialize_agent()`), before line 418 (`await self._stream_agent_response(user_query)`):

```python
            # Initialize agent if needed
            is_new_conversation = self.agent is None and not self.conversation_id
            if self.agent is None:
                await self._initialize_agent()

            # Check for context exhaustion (anonymous ephemeral sessions only)
            if (
                self.agent
                and hasattr(self.agent, "conversation_manager")
                and self.agent.conversation_manager.context_exhausted
            ):
                await self._send_safe(
                    msg_type="ASYNC_ERROR",
                    content="This conversation has reached its context limit. "
                    "Please start a new chat to continue.",
                    data={
                        "error_type": "CONTEXT_EXHAUSTED",
                    },
                )
                return

            # Generate title for new conversations ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/websocket/test_unified_agent_consumer.py::TestContextExhaustionCutoff -v`

Expected: PASS

- [ ] **Step 5: Run all existing backend tests to check for regressions**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_core_agents.py -v`

Expected: All PASS (existing tests should still pass since DB-backed conversations are unaffected)

- [ ] **Step 6: Commit**

```bash
git add config/websocket/consumers/unified_agent_conversation.py opencontractserver/tests/websocket/test_unified_agent_consumer.py
git commit -m "Add context exhaustion check to WebSocket consumer for anonymous sessions"
```

---

## Chunk 3: Frontend — Timeline Fix + Context Exhausted UX

### Task 7: Fix timeline storage in CorpusChat.tsx

**Files:**
- Modify: `frontend/src/components/corpuses/CorpusChat.tsx:682-692` (finalizeStreamingResponse)
- Modify: `frontend/src/components/corpuses/CorpusChat.tsx:741-746` (handleCompleteMessage)

- [ ] **Step 1: Fix finalizeStreamingResponse — add timeline data to message update**

In `CorpusChat.tsx`, modify `finalizeStreamingResponse` (line 682). Add `timeline: timelineData || [],` to the message update object:

```typescript
      updatedMessages[forwardIndex] = {
        ...assistantMsg,
        content,
        isComplete: true,
        hasSources:
          assistantMsg.hasSources ??
          (sourcesData ? sourcesData.length > 0 : false),
        hasTimeline:
          assistantMsg.hasTimeline ??
          (timelineData ? timelineData.length > 0 : false),
        timeline: timelineData || assistantMsg.timeline || [],
      };
```

- [ ] **Step 2: Fix handleCompleteMessage — add timeline to ChatSourceAtom update**

In `CorpusChat.tsx`, modify `handleCompleteMessage` (line 741). Add `timeline` to the existing message update:

```typescript
        const updatedMsg = {
          ...existingMsg,
          content,
          timestamp: messageTimestamp,
          sources: mappedSources.length ? mappedSources : existingMsg.sources,
          timeline: timelineData || existingMsg.timeline,
        };
```

And in the `else` branch (new message, line 758):

```typescript
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              messageId,
              content,
              timestamp: messageTimestamp,
              sources: mappedSources,
              timeline: timelineData || [],
            },
          ],
          selectedMessageId: overrideId ? prev.selectedMessageId : messageId,
        };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/corpuses/CorpusChat.tsx
git commit -m "Fix timeline storage in CorpusChat — store timeline data in message state"
```

---

### Task 8: Add context exhausted UX to CorpusChat

**Files:**
- Modify: `frontend/src/components/corpuses/CorpusChat.tsx` (ASYNC_ERROR handler, chat input area)
- Modify: `frontend/src/components/corpuses/corpus_chat/styles.ts` (new styled component)

- [ ] **Step 1: Add contextExhausted state**

In `CorpusChat.tsx`, add state near the other state declarations (around line 174):

```typescript
const [contextExhausted, setContextExhausted] = useState(false);
```

- [ ] **Step 2: Handle CONTEXT_EXHAUSTED in ASYNC_ERROR case**

In the `onmessage` handler (line 437), update the `ASYNC_ERROR` case:

```typescript
case "ASYNC_ERROR":
  if (data?.error_type === "CONTEXT_EXHAUSTED") {
    setContextExhausted(true);
    setIsProcessing(false);
    break;
  }
  setWsError(data?.error || "Agent error");
  finalizeStreamingResponse(
    data?.error || "Error",
    [],
    data?.message_id
  );
  setIsProcessing(false);
  break;
```

- [ ] **Step 3: Add ContextExhaustedBanner styled component**

In `frontend/src/components/corpuses/corpus_chat/styles.ts`, add:

```typescript
export const ContextExhaustedBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: linear-gradient(
    135deg,
    ${OS_LEGAL_COLORS.warningSurface} 0%,
    #fef3c7 100%
  );
  border-top: 1px solid ${OS_LEGAL_COLORS.warningBorder};
  font-size: 0.8125rem;
  color: ${OS_LEGAL_COLORS.warningText};
  flex-shrink: 0;

  button {
    padding: 0.375rem 0.75rem;
    border: 1px solid ${OS_LEGAL_COLORS.warningBorder};
    border-radius: 6px;
    background: white;
    color: ${OS_LEGAL_COLORS.warningText};
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;

    &:hover {
      background: ${OS_LEGAL_COLORS.warningSurface};
      border-color: ${OS_LEGAL_COLORS.warningText};
    }
  }
`;
```

Check that `OS_LEGAL_COLORS` has `warningSurface`, `warningBorder`, and `warningText` keys. If not, use existing fallback colors (e.g., `#fffbeb`, `#f59e0b`, `#92400e`) or check `osLegalStyles.ts` for the correct key names.

- [ ] **Step 4: Render the banner and disable input when exhausted**

In `CorpusChat.tsx`, import the new styled component and render it above the chat input area (inside the conversation view, before `ChatInputWrapper`):

```typescript
{contextExhausted && (
  <ContextExhaustedBanner>
    <span>This conversation has reached its context limit.</span>
    <button
      onClick={() => {
        setContextExhausted(false);
        startNewChat();
      }}
    >
      Start New Chat
    </button>
  </ContextExhaustedBanner>
)}
```

Also update the chat input disabled state to include `contextExhausted`:

```typescript
disabled={!wsReady || isProcessing || contextExhausted}
```

And the send button:

```typescript
disabled={!wsReady || !newMessage.trim() || isProcessing || contextExhausted}
```

- [ ] **Step 5: Reset contextExhausted when starting new chat**

In the `startNewChat` function (find it by searching for `const startNewChat`), add `setContextExhausted(false)` at the beginning of the function body. This ensures the flag is cleared when the user starts a fresh chat (which creates a new WebSocket connection and a new ephemeral buffer).

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit --pretty`

Expected: No errors.

- [ ] **Step 7: Verify pre-commit passes**

Run: `cd frontend && yarn run prettier --write src/components/corpuses/CorpusChat.tsx src/components/corpuses/corpus_chat/styles.ts && yarn lint`

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/corpuses/CorpusChat.tsx frontend/src/components/corpuses/corpus_chat/styles.ts
git commit -m "Add context exhausted UX — banner with Start New Chat button for anonymous sessions"
```

---

## Chunk 4: Integration Verification

### Task 9: End-to-end manual verification

**Files:**
- Reference: `docs/test_scripts/anonymous-ephemeral-chat-e2e.md` (create)

- [ ] **Step 1: Document manual test script**

Create `docs/test_scripts/anonymous-ephemeral-chat-e2e.md`:

```markdown
# Test: Anonymous Ephemeral Chat

## Purpose
Verify that anonymous users on public corpuses get multi-turn conversation,
working timeline, context tracking, and context exhaustion handling.

## Prerequisites
- A public corpus exists with at least one document
- User is NOT logged in (anonymous/incognito)

## Steps

1. Navigate to the public corpus page (anonymous)
2. Open the chat interface
3. Send a message: "What is this corpus about?"
4. Verify:
   - Response streams back (not stuck loading)
   - Timeline shows steps (tool calls, thoughts) — NOT "0 steps"
   - Context meter at bottom shows > 0% after response
5. Send a follow-up: "Can you tell me more about the first document?"
6. Verify:
   - Response references the prior conversation (multi-turn works)
   - Context meter has increased
   - Timeline shows steps for this message too
7. Refresh the page
8. Verify: Chat is gone (ephemeral — not persisted)

## Expected Results
- Multi-turn conversation works within session
- Timeline and context tracking are accurate
- Data is lost on refresh (by design)
```

- [ ] **Step 2: Run the manual test**

Follow the test script above against a running local instance:

```bash
docker compose -f local.yml up
```

Verify all expected results.

- [ ] **Step 3: Commit test script**

```bash
git add docs/test_scripts/anonymous-ephemeral-chat-e2e.md
git commit -m "Add manual test script for anonymous ephemeral chat"
```

- [ ] **Step 4: Run full backend test suite for regressions**

Run: `docker compose -f test.yml run --rm django pytest -n 4 --dist loadscope -v`

Expected: All existing tests pass. No regressions from the ephemeral buffer changes.
