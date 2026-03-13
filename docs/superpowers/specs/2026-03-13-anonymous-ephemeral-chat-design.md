# Anonymous Ephemeral Chat — Design Spec

## Problem

When anonymous (not logged in) users chat with a public corpus:
1. **Timeline shows "0 steps"** — frontend receives timeline data via WebSocket but never stores it in message state
2. **Context bar shows "0%"** — backend returns `estimated_tokens=0` because `CoreConversationManager` has `conversation=None` and returns empty history
3. **No multi-turn conversation** — each message is independent; the LLM has no memory of prior exchanges in the session
4. **No compaction available** — anonymous users can't compact context, so they hit a hard wall with no guidance

## Solution

In-memory ephemeral conversation tracking on the backend, plus frontend fixes for timeline storage and a "context exhausted" UX.

**No DB changes. No migrations. No new models.** Everything is scoped to the WebSocket session lifetime.

---

## Backend Changes

### 1. CoreConversationManager — Ephemeral Message Buffer

**File**: `opencontractserver/llms/agents/core_agents.py`

When `conversation=None` (anonymous user):

- Add `_ephemeral_messages: list[dict]` field, initialized to `[]`
- Add `_ephemeral_token_estimate: int` field, initialized to `0`
- Add `_ephemeral_next_id: int` counter, initialized to `1` (for synthetic message IDs)

**Method changes**:

| Method | Current (anonymous) | New (anonymous) |
|--------|-------------------|-----------------|
| `store_user_message()` | Returns `0` | Append `{"role": "user", "content": text, "id": _ephemeral_next_id++}` to buffer, update token estimate, return synthetic ID |
| `complete_message()` | No-op | Append `{"role": "assistant", "content": text, "id": _ephemeral_next_id++}` to buffer, update token estimate |
| `update_message()` | No-op | Update matching message in buffer by synthetic ID, recalculate token estimate |
| `get_conversation_messages()` | Returns `[]` | Return `_ephemeral_messages` |
| `create_placeholder_message()` | Returns `0` | Return next synthetic ID |

**Token estimation**: Use existing `CHARS_PER_TOKEN_ESTIMATE` heuristic (len(text) / 3.5). Accumulate in `_ephemeral_token_estimate` on each append.

**Context status**: `_get_message_history()` in the agent will now receive real messages from the buffer, producing accurate `estimated_tokens` and `context_window` (from model config) in `context_status`.

**Context exhausted check**: Add a property `context_exhausted: bool` that returns `True` when `_ephemeral_token_estimate > context_window * 0.9`. The `context_window` value comes from `AgentConfig` (already available). The 10% headroom reserves space for the next response.

### 2. UnifiedAgentConsumer — Cutoff Check

**File**: `config/websocket/consumers/unified_agent_conversation.py`

Before dispatching a user message to the agent:

```
if conversation_manager.context_exhausted:
    send ASYNC_ERROR with:
        error_type: "CONTEXT_EXHAUSTED"
        content: "This conversation has reached its context limit. Please start a new chat to continue."
    return (skip agent run)
```

**Cleanup**: In-memory buffer freed automatically when WebSocket disconnects. No explicit cleanup needed.

---

## Frontend Changes

### 3. useAgentChat.ts — Timeline Storage Fix

**File**: `frontend/src/hooks/useAgentChat.ts`

**Bug 1 — `finalizeResponse()` (~line 551)**:
Currently sets `hasTimeline: timelineData.length > 0` but never assigns the data.

Fix: Add `timeline: timelineData` to the message update object.

**Bug 2 — `handleCompleteMessage()` (~line 407)**:
Accepts `timelineData` parameter but never applies it.

Fix: Add `timeline: timelineData || existingMsg.timeline` to the message update object.

These fixes benefit all users — authenticated users get immediate timeline display without waiting for GraphQL refetch.

### 4. CorpusChat.tsx — Context Exhausted UX

**File**: `frontend/src/components/corpuses/CorpusChat.tsx`

Handle `CONTEXT_EXHAUSTED` error type from `ASYNC_ERROR` WebSocket events:

- Set `contextExhausted` state flag to `true`
- Display a banner above the chat input:
  - Text: "This conversation has reached its context limit."
  - Button: "Start New Chat" (calls existing `startNewChat()` which resets state + creates fresh WebSocket connection)
- Disable chat input and send button while `contextExhausted` is `true`

**Context meter**: No changes needed — it will now show real accumulation since the backend sends accurate `context_status`. Existing color thresholds (green/yellow/red) apply. No compaction banner for anonymous users since `was_compacted` is always `false`.

---

## Scope Boundaries

**In scope**:
- In-memory message buffer for anonymous sessions
- Accurate context tracking and multi-turn conversation
- Timeline display fix (benefits all users)
- Hard cutoff with "Start New Chat" UX

**Out of scope**:
- Persisting anonymous conversations to DB
- Anonymous conversation compaction
- Message count caps or TTLs
- Changes to authenticated user flow
