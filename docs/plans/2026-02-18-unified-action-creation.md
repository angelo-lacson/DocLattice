# Unified Corpus Action Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the "Quick Create" inline agent creation flow (currently thread-only) to work for document triggers, giving users a single-form experience with one instructions field.

**Architecture:** The backend already supports `create_agent_inline=True` for all trigger types — only the frontend restricts it to thread/message triggers. We modify the frontend `CreateCorpusActionModal` to offer Quick Create as the default for document triggers too, with document-appropriate defaults (tools, labels, instructions template). We add a `GET_AVAILABLE_DOCUMENT_TOOLS` query for the tool checkboxes and write a backend test to confirm inline creation works for document triggers.

**Tech Stack:** React/TypeScript/Semantic UI (frontend), Django/Graphene (backend test)

---

### Task 1: Backend Test — Verify Inline Agent Creation for Document Triggers

The backend already supports this, but there's no test proving it. Add one.

**Files:**
- Modify: `opencontractserver/tests/test_run_corpus_action.py`

**Step 1: Write the test**

Add a new test class to `opencontractserver/tests/test_run_corpus_action.py`:

```python
class TestInlineAgentCreationForDocumentTriggers(GraphQLTestCase):
    """Verify that create_agent_inline works for document triggers (add_document, edit_document)."""

    GRAPHQL_URL = "/graphql/"

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="inline-test-admin", password="adminpass", email="inline@test.com"
        )
        self.corpus = Corpus.objects.create(title="Test Corpus", creator=self.user)

    def test_inline_agent_creation_for_add_document_trigger(self):
        """create_agent_inline=True works for add_document trigger."""
        from opencontractserver.agents.models import AgentConfiguration

        self.client.force_login(self.user)
        response = self.query(
            """
            mutation CreateCorpusAction(
                $corpusId: ID!
                $trigger: String!
                $name: String
                $taskInstructions: String
                $createAgentInline: Boolean
                $inlineAgentName: String
                $inlineAgentInstructions: String
                $inlineAgentTools: [String]
            ) {
                createCorpusAction(
                    corpusId: $corpusId
                    trigger: $trigger
                    name: $name
                    taskInstructions: $taskInstructions
                    createAgentInline: $createAgentInline
                    inlineAgentName: $inlineAgentName
                    inlineAgentInstructions: $inlineAgentInstructions
                    inlineAgentTools: $inlineAgentTools
                ) {
                    ok
                    message
                    obj {
                        id
                        name
                        trigger
                        agentConfig { id name }
                        taskInstructions
                    }
                }
            }
            """,
            variables={
                "corpusId": str(self.corpus.id),
                "trigger": "add_document",
                "name": "Auto Summarizer",
                "taskInstructions": "Summarize the document and update its description.",
                "createAgentInline": True,
                "inlineAgentName": "Doc Summarizer Agent",
                "inlineAgentInstructions": "You are a document processing agent.",
                "inlineAgentTools": [
                    "load_document_txt_extract",
                    "update_document_description",
                ],
            },
        )
        content = response.json()
        data = content["data"]["createCorpusAction"]
        self.assertTrue(data["ok"], f"Mutation failed: {data['message']}")
        self.assertEqual(data["obj"]["trigger"], "ADD_DOCUMENT")
        self.assertIsNotNone(data["obj"]["agentConfig"])
        self.assertEqual(data["obj"]["agentConfig"]["name"], "Doc Summarizer Agent")
        self.assertEqual(
            data["obj"]["taskInstructions"],
            "Summarize the document and update its description.",
        )

        # Verify the agent was created with correct attributes
        agent = AgentConfiguration.objects.get(name="Doc Summarizer Agent")
        self.assertEqual(agent.scope, "CORPUS")
        self.assertEqual(agent.corpus_id, self.corpus.id)
        self.assertEqual(agent.available_tools, [
            "load_document_txt_extract",
            "update_document_description",
        ])
```

**Step 2: Run the test**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_run_corpus_action.py::TestInlineAgentCreationForDocumentTriggers -v`
Expected: PASS (the backend already supports this)

**Step 3: Run pre-commit and commit**

Run: `pre-commit run --all-files`

```bash
git add opencontractserver/tests/test_run_corpus_action.py
git commit -m "Add test verifying inline agent creation works for document triggers"
```

---

### Task 2: Frontend — Add Document Tools Query

**Files:**
- Modify: `frontend/src/graphql/queries.ts`

**Step 1: Add the query**

Add after `GET_AVAILABLE_MODERATION_TOOLS` (around line 4467) in `frontend/src/graphql/queries.ts`:

```typescript
/**
 * GET_AVAILABLE_DOCUMENT_TOOLS - Get available document-category tools from backend
 * Used in CreateCorpusActionModal for inline agent creation on document triggers
 */
export interface GetAvailableDocumentToolsOutput {
  availableTools: AvailableTool[];
}

export const GET_AVAILABLE_DOCUMENT_TOOLS = gql`
  query GetAvailableDocumentTools {
    availableTools(category: "document") {
      name
      description
      category
      requiresApproval
    }
  }
`;
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/graphql/queries.ts
git commit -m "Add GET_AVAILABLE_DOCUMENT_TOOLS query for inline agent creation"
```

---

### Task 3: Frontend — Extend CreateCorpusActionModal for Document Triggers

This is the main task. We modify `CreateCorpusActionModal.tsx` to offer Quick Create inline agent mode for document triggers.

**Files:**
- Modify: `frontend/src/components/corpuses/CreateCorpusActionModal.tsx`

**Overview of changes:**

1. Add default document agent instructions constant
2. Add state for document tool selection
3. Add `GET_AVAILABLE_DOCUMENT_TOOLS` query
4. When trigger changes to document type, keep `useInlineAgent=true` (don't force `false`)
5. Change `isInlineAgentCreation` to remove `isThreadTrigger` requirement
6. Extend the inline creation UI section to render for document triggers too
7. Adapt labels, defaults, and tool checkboxes for document context
8. Update validation to handle document-trigger inline creation
9. Wire `inlineAgentTools` to use document tools when trigger is document type

**Step 1: Add default document agent instructions constant**

After `DEFAULT_MODERATOR_INSTRUCTIONS` (around line 37-42), add:

```typescript
const DEFAULT_DOCUMENT_AGENT_INSTRUCTIONS =
  "You are a document processing agent for this corpus.";
```

This is intentionally minimal — the real instructions go in the `taskInstructions` field.

**Step 2: Import the new query and add the useQuery hook**

Add to the imports from `../../graphql/queries`:
```typescript
import {
  // ... existing imports ...
  GET_AVAILABLE_DOCUMENT_TOOLS,
  GetAvailableDocumentToolsOutput,
} from "../../graphql/queries";
```

Add a new `useQuery` hook alongside the existing `GET_AVAILABLE_MODERATION_TOOLS` one (around line 300):

```typescript
const isDocTrigger = trigger === "add_document" || trigger === "edit_document";

const { data: documentToolsData, loading: documentToolsLoading } =
  useQuery<GetAvailableDocumentToolsOutput>(GET_AVAILABLE_DOCUMENT_TOOLS, {
    skip: !isDocTrigger,
  });

const documentTools: AvailableTool[] =
  documentToolsData?.availableTools ?? [];
```

**Step 3: Add state for selected document tools**

Around line 126 (alongside `selectedModerationTools`):

```typescript
const [selectedDocumentTools, setSelectedDocumentTools] = React.useState<
  string[]
>([]);
```

**Step 4: Update the `resetForm` function**

In the `resetForm` function (around line 143-154), add:

```typescript
setSelectedDocumentTools([]);
```

**Step 5: Change trigger onChange behavior (CRITICAL)**

Around line 580-592, the trigger dropdown's onChange handler currently resets `useInlineAgent` to `false` for document triggers. Change this so document triggers ALSO default to inline mode:

Replace the block at lines ~580-592 that handles trigger change (inside the `onChange` handler for the trigger dropdown). Find the code that does:
```typescript
} else {
  // For document triggers, reset to existing agent mode
  setUseInlineAgent(false);
}
```

Replace with:
```typescript
} else {
  // For document triggers, default to inline agent mode
  setUseInlineAgent(true);
  setInlineAgentName("");
  setInlineAgentInstructions(DEFAULT_DOCUMENT_AGENT_INSTRUCTIONS);
  // Pre-select all document tools once they load
  if (documentTools.length > 0) {
    setSelectedDocumentTools(documentTools.map((t) => t.name));
  }
}
```

**Step 6: Change `isInlineAgentCreation` (CRITICAL)**

Line 410 currently reads:
```typescript
const isInlineAgentCreation =
  actionType === "agent" && isThreadTrigger && useInlineAgent;
```

Change to:
```typescript
const isInlineAgentCreation =
  actionType === "agent" && useInlineAgent && !isEditMode;
```

This removes the `isThreadTrigger` restriction. The `!isEditMode` guard is already implied by the UI (edit mode doesn't show the inline toggle) but makes it explicit.

**Step 7: Wire `inlineAgentTools` for document triggers**

In the submit handler (around lines 440-452), the `inlineAgentTools` is currently always set from `selectedModerationTools`. Make it context-dependent:

Find:
```typescript
inlineAgentTools: isInlineAgentCreation
  ? selectedModerationTools
  : undefined,
```

Replace with:
```typescript
inlineAgentTools: isInlineAgentCreation
  ? isThreadTrigger
    ? selectedModerationTools
    : selectedDocumentTools
  : undefined,
```

**Step 8: Update validation for document-trigger inline creation**

Around lines 344-355, validation only checks inline fields for `isThreadTrigger && useInlineAgent`. Broaden to check for any trigger with inline mode:

Find:
```typescript
if (isThreadTrigger && useInlineAgent) {
```

Replace with:
```typescript
if (useInlineAgent && !isEditMode && actionType === "agent") {
```

This makes validation apply for both thread and document inline creation.

**Step 9: Extend the inline creation UI to document triggers**

The large JSX block at lines 685-958 currently has two branches:
- `{isThreadTrigger && !isEditMode && ( ... )}` — shows the Quick Create / Existing Agent toggle for threads
- `{(!isThreadTrigger || isEditMode) && ( ... )}` — shows ONLY the "Select existing agent" dropdown for documents

Restructure the conditional so that document triggers ALSO get the Quick Create toggle. The simplest approach:

**Replace the outer conditional** at line 685 from `{isThreadTrigger && !isEditMode && (` to `{!isEditMode && actionType === "agent" && (`.

This makes the Quick Create / Existing Agent toggle visible for ALL trigger types in create mode.

**Inside this block**, adapt the labels and tools section to be context-dependent:

- The info message (lines 687-698): Make it trigger-aware:
  ```typescript
  <Message info size="small">
    <p>
      <Icon name={isThreadTrigger ? "comments" : "file text"} />
      Configure an AI agent for{" "}
      <strong>
        {isThreadTrigger ? "automated moderation" : "document processing"}
      </strong>
      . The agent will execute automatically when{" "}
      {trigger === "new_thread"
        ? "a new discussion thread is created"
        : trigger === "new_message"
          ? "a new message is posted to a thread"
          : trigger === "add_document"
            ? "a document is added to this corpus"
            : "a document is edited in this corpus"}
      .
    </p>
  </Message>
  ```

- The tab labels (lines 700-713): Make them trigger-aware:
  ```typescript
  <Menu.Item
    name={isThreadTrigger ? "Quick Create Moderator" : "Quick Create Agent"}
    active={useInlineAgent}
    onClick={() => setUseInlineAgent(true)}
    icon="magic"
  />
  ```

- The positive message (lines 718-722): Make trigger-aware:
  ```typescript
  <Message positive size="small">
    <Icon name="lightning" />
    <strong>Quick Create:</strong>{" "}
    {isThreadTrigger
      ? "Creates a new moderator agent with all moderation tools enabled."
      : "Creates a new agent with document processing tools enabled."}
  </Message>
  ```

- The "System Instructions" field (lines 749-769): For document triggers, this should be a brief field with a clear label:
  ```typescript
  <Form.Field required>
    <label>
      {isThreadTrigger ? "System Instructions" : "Agent Role"}
    </label>
    <TextArea
      value={inlineAgentInstructions}
      onChange={(e, data) =>
        setInlineAgentInstructions(data.value as string)
      }
      placeholder={
        isThreadTrigger
          ? "Instructions that define the agent's behavior and policies"
          : "Brief role description (e.g., 'You are a document summarizer')"
      }
      rows={isThreadTrigger ? 4 : 2}
    />
    <small style={{ color: "#666", marginTop: "0.5em", display: "block" }}>
      {isThreadTrigger
        ? "These instructions define how the agent behaves and what moderation policies it follows."
        : "Optional persona guidelines. The main instructions go in the Task Instructions field below."}
    </small>
  </Form.Field>
  ```

- The tools section (lines 793-884): For document triggers, show document tools instead of moderation tools:
  ```typescript
  <Form.Field required>
    <label>
      {isThreadTrigger ? "Moderation Tools" : "Document Tools"}{" "}
      <Label size="tiny" color="green">
        {(isThreadTrigger ? selectedModerationTools : selectedDocumentTools).length} selected
      </Label>
      {(isThreadTrigger ? toolsLoading : documentToolsLoading) && (
        <Loader active inline size="tiny" style={{ marginLeft: "0.5rem" }} />
      )}
    </label>
    <div style={{ background: "#f8f9fa", borderRadius: "8px", padding: "1rem", border: "1px solid #e9ecef" }}>
      {(isThreadTrigger ? moderationTools : documentTools).map((tool) => (
        <div key={tool.name} style={{ display: "flex", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #e9ecef" }}>
          <Checkbox
            checked={(isThreadTrigger ? selectedModerationTools : selectedDocumentTools).includes(tool.name)}
            onChange={(_, data) => {
              const setter = isThreadTrigger ? setSelectedModerationTools : setSelectedDocumentTools;
              if (data.checked) {
                setter((prev) => [...prev, tool.name]);
              } else {
                setter((prev) => prev.filter((t) => t !== tool.name));
              }
            }}
            label={
              <label style={{ fontWeight: 500, cursor: "pointer" }}>
                {tool.name.replace(/_/g, " ")}
                <span style={{ color: "#666", fontWeight: 400, marginLeft: "0.5rem" }}>
                  - {tool.description}
                </span>
              </label>
            }
          />
        </div>
      ))}
    </div>
    <div style={{ marginTop: "0.5rem" }}>
      <Button type="button" size="tiny" onClick={() => {
        const tools = isThreadTrigger ? moderationTools : documentTools;
        const setter = isThreadTrigger ? setSelectedModerationTools : setSelectedDocumentTools;
        setter(tools.map((t) => t.name));
      }}>Select All</Button>
      <Button type="button" size="tiny" onClick={() => {
        const setter = isThreadTrigger ? setSelectedModerationTools : setSelectedDocumentTools;
        setter([]);
      }}>Clear All</Button>
    </div>
  </Form.Field>
  ```

**Step 10: Remove the now-redundant document-trigger "Select existing agent" section**

The block at lines 960-1039 (`{(!isThreadTrigger || isEditMode) && ( ... )}`) currently shows the old agent-picker-only UI for document triggers. Change its condition to `{isEditMode && actionType === "agent" && (` since in create mode, the unified Quick Create / Existing Agent toggle now handles both trigger types.

**Step 11: Auto-select document tools when they load**

Add a `useEffect` to pre-select all document tools when the query finishes loading:

```typescript
React.useEffect(() => {
  if (documentTools.length > 0 && selectedDocumentTools.length === 0 && isDocTrigger) {
    setSelectedDocumentTools(documentTools.map((t) => t.name));
  }
}, [documentTools, isDocTrigger]);
```

**Step 12: Verify TypeScript compiles and lint passes**

Run: `cd frontend && npx tsc --noEmit && yarn lint`
Expected: No errors

**Step 13: Commit**

```bash
git add frontend/src/components/corpuses/CreateCorpusActionModal.tsx
git commit -m "Extend Quick Create inline agent flow to document triggers"
```

---

### Task 4: End-to-End Verification

**Step 1: Run backend tests**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_run_corpus_action.py -v`
Expected: All passed (including the new inline creation test)

**Step 2: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Run pre-commit**

Run: `pre-commit run --all-files`
Expected: All passed
