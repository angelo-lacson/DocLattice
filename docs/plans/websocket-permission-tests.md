# Test Plan: WebSocket Agent Permission Escalation Prevention

## Overview

This test plan ensures that agents operating via WebSocket connections cannot escalate beyond the calling user's permissions. Tests cover three security layers:

1. **Consumer Layer** - Connection-time permission validation
2. **Tool Filtering Layer** - Agent factory permission-based tool filtering
3. **Runtime Layer** - Defense-in-depth tool execution checks

## Test File Structure

```
opencontractserver/tests/websocket/
├── test_unified_agent_consumer.py          # Existing - basic consumer tests
├── test_agent_permission_escalation.py     # NEW - comprehensive permission tests
└── conftest.py                             # Shared fixtures
```

---

## Test Categories

### Category 1: Consumer-Level Permission Validation

Tests that verify `UnifiedAgentConsumer` properly validates permissions at connection time.

#### 1.1 Corpus Permission Tests

| Test ID | Test Name | Setup | Action | Expected Result |
|---------|-----------|-------|--------|-----------------|
| C1.1 | `test_authenticated_user_with_corpus_read_connects` | User with READ on private corpus | Connect with `corpus_id` | Connection accepted |
| C1.2 | `test_authenticated_user_without_corpus_read_rejected` | User WITHOUT READ on private corpus | Connect with `corpus_id` | Connection rejected (4003) |
| C1.3 | `test_anonymous_user_public_corpus_connects` | Public corpus | Connect without token | Connection accepted |
| C1.4 | `test_anonymous_user_private_corpus_rejected` | Private corpus | Connect without token | Connection rejected (4003) |
| C1.5 | `test_user_with_only_crud_no_read_rejected` | User with CRUD but not READ (edge case) | Connect with `corpus_id` | Connection rejected (4003) |

#### 1.2 Document Permission Tests

| Test ID | Test Name | Setup | Action | Expected Result |
|---------|-----------|-------|--------|-----------------|
| D1.1 | `test_authenticated_user_with_document_read_connects` | User with READ on private document | Connect with `document_id` | Connection accepted |
| D1.2 | `test_authenticated_user_without_document_read_rejected` | User WITHOUT READ on private document | Connect with `document_id` | Connection rejected (4003) |
| D1.3 | `test_anonymous_user_public_document_connects` | Public document | Connect without token | Connection accepted |
| D1.4 | `test_anonymous_user_private_document_rejected` | Private document | Connect without token | Connection rejected (4003) |

#### 1.3 Document + Corpus Combined Permission Tests

| Test ID | Test Name | Setup | Action | Expected Result |
|---------|-----------|-------|--------|-----------------|
| DC1.1 | `test_user_with_document_read_but_not_corpus_read` | User has READ on doc, NOT on corpus | Connect with both IDs | Connection rejected (4003) |
| DC1.2 | `test_user_with_corpus_read_but_not_document_read` | User has READ on corpus, NOT on doc | Connect with both IDs | Connection rejected (4003) |
| DC1.3 | `test_user_with_both_permissions_connects` | User has READ on both | Connect with both IDs | Connection accepted |

---

### Category 2: Tool Filtering Tests

Tests that verify the agent factory properly filters tools based on user's WRITE permission.

#### 2.1 Write Tool Filtering - Corpus Agent

| Test ID | Test Name | Setup | Action | Expected Result |
|---------|-----------|-------|--------|-----------------|
| TF2.1 | `test_corpus_agent_write_tools_available_for_owner` | Owner of corpus | Create corpus agent with write tools | All write tools available |
| TF2.2 | `test_corpus_agent_write_tools_filtered_for_read_only_user` | User with only READ | Create corpus agent with write tools | Write tools filtered out |
| TF2.3 | `test_corpus_agent_write_tools_filtered_for_anonymous` | Anonymous user, public corpus | Create corpus agent | Write tools filtered out |
| TF2.4 | `test_corpus_agent_read_tools_available_for_all` | User with READ only | Create corpus agent with read tools | All read tools available |

#### 2.2 Write Tool Filtering - Document Agent

| Test ID | Test Name | Setup | Action | Expected Result |
|---------|-----------|-------|--------|-----------------|
| TF2.5 | `test_document_agent_write_tools_available_for_owner` | Owner of document | Create document agent with write tools | All write tools available |
| TF2.6 | `test_document_agent_write_tools_filtered_for_read_only_user` | User with only READ | Create document agent with write tools | Write tools filtered out |
| TF2.7 | `test_document_agent_write_tools_filtered_for_anonymous` | Anonymous user, public document | Create document agent | Write tools filtered out |

#### 2.3 Specific Tool Filtering Verification

| Test ID | Test Name | Tool Being Tested | User Permission | Expected |
|---------|-----------|-------------------|-----------------|----------|
| TF2.8 | `test_add_document_note_filtered_for_read_user` | `add_document_note` | READ only | Filtered |
| TF2.9 | `test_update_document_summary_filtered_for_read_user` | `update_document_summary` | READ only | Filtered |
| TF2.10 | `test_update_corpus_description_filtered_for_read_user` | `update_corpus_description` | READ only | Filtered |
| TF2.11 | `test_duplicate_annotations_filtered_for_read_user` | `duplicate_annotations_with_label` | READ only | Filtered |
| TF2.12 | `test_similarity_search_available_for_read_user` | `similarity_search` | READ only | Available |
| TF2.13 | `test_load_document_summary_available_for_read_user` | `load_document_md_summary` | READ only | Available |

---

### Category 3: Runtime Permission Validation (Defense in Depth)

Tests that verify `_check_user_permissions()` blocks unauthorized tool execution even if filtering fails.

#### 3.1 Direct Tool Execution Tests

| Test ID | Test Name | Setup | Action | Expected Result |
|---------|-----------|-------|--------|-----------------|
| RT3.1 | `test_runtime_check_blocks_anonymous_on_private_document` | Private document, bypass filtering | Execute tool with anonymous ctx | `PermissionError` raised |
| RT3.2 | `test_runtime_check_blocks_anonymous_on_private_corpus` | Private corpus, bypass filtering | Execute tool with anonymous ctx | `PermissionError` raised |
| RT3.3 | `test_runtime_check_blocks_user_without_document_read` | User without READ, bypass filtering | Execute tool | `PermissionError` raised |
| RT3.4 | `test_runtime_check_blocks_user_without_corpus_read` | User without READ, bypass filtering | Execute tool | `PermissionError` raised |
| RT3.5 | `test_runtime_check_allows_user_with_read_permission` | User with READ | Execute read tool | Tool executes successfully |
| RT3.6 | `test_runtime_check_allows_anonymous_on_public_resource` | Public resource | Execute read tool | Tool executes successfully |

---

### Category 4: Permission Escalation Scenarios

Tests for specific escalation attack vectors.

#### 4.1 Cross-User Escalation

| Test ID | Test Name | Scenario | Expected Result |
|---------|-----------|----------|-----------------|
| PE4.1 | `test_agent_created_by_admin_used_by_regular_user` | Admin creates agent config, regular user calls it | Regular user's permissions enforced |
| PE4.2 | `test_shared_corpus_different_user_permissions` | Corpus shared with 2 users (one READ, one CRUD) | Each user gets their own permission level |
| PE4.3 | `test_user_cannot_access_other_users_document_via_agent` | User A's agent, User B's document | Access denied |

#### 4.2 Permission Change During Session

| Test ID | Test Name | Scenario | Expected Result |
|---------|-----------|----------|-----------------|
| PE4.4 | `test_permission_revoked_mid_session_blocks_next_call` | User connects, permission revoked, sends message | Tool execution blocked |
| PE4.5 | `test_document_made_private_mid_session` | Anonymous on public doc, doc made private | Next tool call blocked |
| PE4.6 | `test_permission_granted_mid_session_allows_next_call` | Read-only user, CRUD granted mid-session | Write tools now work |

#### 4.3 Resource Substitution Attacks

| Test ID | Test Name | Attack Vector | Expected Result |
|---------|-----------|---------------|-----------------|
| PE4.7 | `test_cannot_access_different_document_via_tool_params` | Tool called with different document_id | Blocked by context validation |
| PE4.8 | `test_cannot_access_different_corpus_via_tool_params` | Tool called with different corpus_id | Blocked by context validation |
| PE4.9 | `test_tool_params_cannot_override_context_ids` | Malicious tool args try to change target | Context IDs take precedence |

---

### Category 5: Integration Tests (Full Flow)

End-to-end tests verifying complete permission flow through WebSocket.

#### 5.1 Full Conversation Flow Tests

| Test ID | Test Name | Scenario | Verification Points |
|---------|-----------|----------|---------------------|
| IT5.1 | `test_read_only_user_full_conversation` | User with READ connects, queries, receives response | 1. Connection succeeds 2. Read tools work 3. Write tools unavailable |
| IT5.2 | `test_owner_full_conversation_with_write` | Owner connects, creates note via agent | 1. Connection succeeds 2. Write tools available 3. Note created |
| IT5.3 | `test_anonymous_public_corpus_conversation` | No token, public corpus | 1. Connection succeeds 2. Read tools work 3. No write tools |
| IT5.4 | `test_permission_denied_error_message_flow` | User without permission queries | 1. Connection rejected 2. Proper error code |

#### 5.2 Multi-Turn Conversation Tests

| Test ID | Test Name | Scenario | Verification |
|---------|-----------|----------|--------------|
| IT5.5 | `test_multi_turn_maintains_permission_context` | Multiple messages in session | Each turn respects original permissions |
| IT5.6 | `test_conversation_resume_respects_current_permissions` | Load existing conversation | Current user's permissions, not creator's |

---

## Test Implementation Details

### Fixtures Required

```python
@pytest.fixture
async def corpus_with_permissions():
    """Create corpus with specific permission setup."""
    corpus = await Corpus.objects.acreate(
        title="Test Corpus",
        is_public=False,
        creator=owner_user
    )
    # Set up permissions for different test users
    return corpus

@pytest.fixture
async def document_with_permissions():
    """Create document with specific permission setup."""
    ...

@pytest.fixture
async def read_only_user(corpus_with_permissions):
    """User with only READ permission on corpus."""
    user = await User.objects.acreate(username="reader")
    await set_permissions_for_obj_to_user(
        user, corpus_with_permissions, [PermissionTypes.READ]
    )
    return user

@pytest.fixture
async def crud_user(corpus_with_permissions):
    """User with full CRUD permission on corpus."""
    user = await User.objects.acreate(username="editor")
    await set_permissions_for_obj_to_user(
        user, corpus_with_permissions, [PermissionTypes.ALL]
    )
    return user

@pytest.fixture
async def no_permission_user():
    """User with no permissions on any test resources."""
    return await User.objects.acreate(username="outsider")
```

### Mock Agent for Testing

```python
class MockAgentForPermissionTests:
    """Mock agent that records which tools are available."""

    def __init__(self, available_tools: list[str]):
        self.available_tools = available_tools
        self.tool_calls = []

    async def stream(self, query: str):
        # Record the query and yield mock events
        yield StartEvent(...)
        yield ContentEvent(content="Mock response")
        yield FinalEvent(...)

    def get_available_tool_names(self) -> list[str]:
        return self.available_tools
```

### WebSocket Test Helper

```python
async def connect_and_verify(
    application,
    path: str,
    expected_connected: bool,
    expected_close_code: int | None = None
):
    """Helper to test WebSocket connection acceptance/rejection."""
    communicator = WebsocketCommunicator(application, path)
    connected, code = await communicator.connect()

    assert connected == expected_connected
    if expected_close_code:
        assert code == expected_close_code

    if connected:
        await communicator.disconnect()

    return communicator
```

---

## Test Data Matrix

### Permission Combinations to Test

| User Type | Corpus Permission | Document Permission | Public Resource | Expected Access |
|-----------|-------------------|---------------------|-----------------|-----------------|
| Owner | CRUD (implicit) | CRUD (implicit) | N/A | Full access |
| Editor | CRUD (granted) | CRUD (granted) | N/A | Full access |
| Viewer | READ (granted) | READ (granted) | N/A | Read-only |
| Outsider | None | None | No | No access |
| Outsider | None | None | Yes | Read-only |
| Anonymous | N/A | N/A | No | No access |
| Anonymous | N/A | N/A | Yes | Read-only |

### Tools to Verify Filtering

| Tool Name | `requires_write_permission` | Expected for READ user |
|-----------|----------------------------|------------------------|
| `similarity_search` | `False` | Available |
| `load_document_md_summary` | `False` | Available |
| `get_notes_for_document_corpus` | `False` | Available |
| `add_document_note` | `True` | Filtered |
| `update_document_note` | `True` | Filtered |
| `update_document_summary` | `True` | Filtered |
| `update_corpus_description` | `True` | Filtered |
| `duplicate_annotations_with_label` | `True` | Filtered |
| `add_annotations_from_exact_strings` | `True` | Filtered |

---

## Success Criteria

- [ ] All consumer-level permission tests pass (Category 1)
- [ ] All tool filtering tests pass (Category 2)
- [ ] All runtime validation tests pass (Category 3)
- [ ] All escalation scenario tests pass (Category 4)
- [ ] All integration tests pass (Category 5)
- [ ] No test relies on implementation details that could change
- [ ] Tests are independent and can run in parallel
- [ ] Tests cover both positive (allowed) and negative (denied) cases
- [ ] Error messages are verified (not just error occurrence)

---

## Implementation Priority

1. **P0 - Critical**: Categories 1, 4.1, 4.3 (connection and escalation prevention)
2. **P1 - High**: Categories 2, 3 (tool filtering and runtime checks)
3. **P2 - Medium**: Categories 4.2, 5 (mid-session changes, integration)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `opencontractserver/tests/websocket/test_agent_permission_escalation.py` | CREATE | Main test file |
| `opencontractserver/tests/websocket/conftest.py` | MODIFY | Add shared fixtures |
| `opencontractserver/tests/fixtures/permission_fixtures.py` | CREATE | Reusable permission setups |

---

## Estimated Test Count

| Category | Test Count |
|----------|------------|
| Category 1: Consumer | 12 |
| Category 2: Tool Filtering | 13 |
| Category 3: Runtime | 6 |
| Category 4: Escalation | 9 |
| Category 5: Integration | 6 |
| **Total** | **46** |
