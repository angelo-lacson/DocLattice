# Manual Corpus Action Trigger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow superusers to manually run a specific agent-based corpus action on a chosen document via a new GraphQL mutation and frontend UI.

**Architecture:** A `RunCorpusAction` superuser-only mutation creates a `CorpusActionExecution` record and dispatches the existing `run_agent_corpus_action` Celery task. The frontend adds a "Run" button to each action card in `CorpusActionsSection` that opens a document-picker modal calling this mutation.

**Tech Stack:** Django/Graphene (backend mutation), React/TypeScript/Apollo Client/Semantic UI (frontend), Celery (async dispatch)

---

### Task 1: Backend Mutation — `RunCorpusAction`

**Files:**
- Modify: `config/graphql/mutations.py` (add mutation class + wire into `Mutation`)
- Test: `opencontractserver/tests/test_run_corpus_action.py`

**Step 1: Write the failing test**

Create `opencontractserver/tests/test_run_corpus_action.py`:

```python
"""Tests for the RunCorpusAction mutation."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from graphene_django.utils.testing import GraphQLTestCase

from opencontractserver.corpuses.models import (
    Corpus,
    CorpusAction,
    CorpusActionExecution,
)
from opencontractserver.documents.models import Document

User = get_user_model()

RUN_CORPUS_ACTION_MUTATION = """
    mutation RunCorpusAction($corpusActionId: ID!, $documentId: ID!) {
        runCorpusAction(corpusActionId: $corpusActionId, documentId: $documentId) {
            ok
            message
            obj {
                id
                status
            }
        }
    }
"""


class TestRunCorpusAction(GraphQLTestCase):
    """Test the RunCorpusAction mutation."""

    GRAPHQL_URL = "/graphql/"

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="admin", password="adminpass", email="admin@test.com"
        )
        self.regular_user = User.objects.create_user(
            username="regular", password="regularpass"
        )
        self.corpus = Corpus.objects.create(
            title="Test Corpus", creator=self.superuser
        )
        self.document = Document.objects.create(
            title="Test Doc", creator=self.superuser
        )
        # Add document to corpus
        self.corpus.documents.add(self.document)

        # Create an agent-based corpus action (lightweight — task_instructions only)
        self.action = CorpusAction.objects.create(
            corpus=self.corpus,
            name="Test Agent Action",
            trigger="add_document",
            task_instructions="Summarize this document.",
            creator=self.superuser,
        )

        # Create a non-agent action (fieldset-based) for negative testing
        from opencontractserver.extracts.models import Column, Fieldset

        self.fieldset = Fieldset.objects.create(
            name="Test Fieldset", creator=self.superuser
        )
        Column.objects.create(
            fieldset=self.fieldset,
            name="Col",
            query="q",
            output_type="str",
            creator=self.superuser,
        )
        self.fieldset_action = CorpusAction.objects.create(
            corpus=self.corpus,
            name="Test Fieldset Action",
            trigger="add_document",
            fieldset=self.fieldset,
            creator=self.superuser,
        )

    @patch("config.graphql.mutations.run_agent_corpus_action.delay")
    def test_superuser_can_run_agent_action(self, mock_delay):
        """Superuser can manually trigger an agent action on a document."""
        self.client.force_login(self.superuser)
        response = self.query(
            RUN_CORPUS_ACTION_MUTATION,
            variables={
                "corpusActionId": str(self.action.id),
                "documentId": str(self.document.id),
            },
        )
        content = response.json()
        data = content["data"]["runCorpusAction"]
        self.assertTrue(data["ok"])

        # Verify execution record was created
        execution = CorpusActionExecution.objects.get()
        self.assertEqual(execution.status, CorpusActionExecution.Status.QUEUED)
        self.assertEqual(execution.corpus_action_id, self.action.id)
        self.assertEqual(execution.document_id, self.document.id)

        # Verify Celery task was dispatched
        mock_delay.assert_called_once_with(
            corpus_action_id=self.action.id,
            document_id=self.document.id,
            user_id=self.superuser.id,
            execution_id=execution.id,
        )

    def test_regular_user_rejected(self):
        """Non-superuser gets permission denied."""
        self.client.force_login(self.regular_user)
        response = self.query(
            RUN_CORPUS_ACTION_MUTATION,
            variables={
                "corpusActionId": str(self.action.id),
                "documentId": str(self.document.id),
            },
        )
        content = response.json()
        # user_passes_test returns error when non-superuser
        self.assertIn("errors", content)

    @patch("config.graphql.mutations.run_agent_corpus_action.delay")
    def test_rejects_non_agent_action(self, mock_delay):
        """Fieldset/analyzer actions are rejected."""
        self.client.force_login(self.superuser)
        response = self.query(
            RUN_CORPUS_ACTION_MUTATION,
            variables={
                "corpusActionId": str(self.fieldset_action.id),
                "documentId": str(self.document.id),
            },
        )
        content = response.json()
        data = content["data"]["runCorpusAction"]
        self.assertFalse(data["ok"])
        self.assertIn("agent", data["message"].lower())
        mock_delay.assert_not_called()

    @patch("config.graphql.mutations.run_agent_corpus_action.delay")
    def test_rejects_document_not_in_corpus(self, mock_delay):
        """Document must belong to the action's corpus."""
        other_doc = Document.objects.create(
            title="Other Doc", creator=self.superuser
        )
        self.client.force_login(self.superuser)
        response = self.query(
            RUN_CORPUS_ACTION_MUTATION,
            variables={
                "corpusActionId": str(self.action.id),
                "documentId": str(other_doc.id),
            },
        )
        content = response.json()
        data = content["data"]["runCorpusAction"]
        self.assertFalse(data["ok"])
        self.assertIn("not in", data["message"].lower())
        mock_delay.assert_not_called()

    @patch("config.graphql.mutations.run_agent_corpus_action.delay")
    def test_rejects_nonexistent_action(self, mock_delay):
        """Nonexistent action ID returns error."""
        self.client.force_login(self.superuser)
        response = self.query(
            RUN_CORPUS_ACTION_MUTATION,
            variables={
                "corpusActionId": "99999",
                "documentId": str(self.document.id),
            },
        )
        content = response.json()
        data = content["data"]["runCorpusAction"]
        self.assertFalse(data["ok"])
        mock_delay.assert_not_called()
```

**Step 2: Run tests to verify they fail**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_run_corpus_action.py -v`
Expected: FAIL — `runCorpusAction` field does not exist on Mutation type

**Step 3: Implement the mutation**

Add to `config/graphql/mutations.py` — place AFTER the `DeleteCorpusAction` class (after line ~5337) and BEFORE the `Mutation` class:

```python
class RunCorpusAction(graphene.Mutation):
    """
    Manually trigger a specific agent-based corpus action on a document.

    Superuser-only. Creates a CorpusActionExecution record and dispatches
    the run_agent_corpus_action Celery task.
    """

    class Arguments:
        corpus_action_id = graphene.ID(
            required=True,
            description="ID of the CorpusAction to run",
        )
        document_id = graphene.ID(
            required=True,
            description="ID of the Document to run the action against",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(CorpusActionExecutionType)

    @user_passes_test(lambda user: user.is_superuser)
    @graphql_ratelimit(rate=RateLimits.ADMIN_OPERATION)
    def mutate(root, info, corpus_action_id: str, document_id: str):
        from django.utils import timezone

        from opencontractserver.corpuses.models import CorpusActionExecution
        from opencontractserver.tasks.agent_tasks import run_agent_corpus_action

        user = info.context.user

        # Validate action exists
        try:
            action = CorpusAction.objects.get(pk=corpus_action_id)
        except CorpusAction.DoesNotExist:
            return RunCorpusAction(
                ok=False, message="Corpus action not found."
            )

        # Must be an agent action
        if not action.is_agent_action:
            return RunCorpusAction(
                ok=False,
                message="Only agent-based actions can be manually triggered.",
            )

        # Validate document exists and belongs to the action's corpus
        try:
            document = Document.objects.get(pk=document_id)
        except Document.DoesNotExist:
            return RunCorpusAction(
                ok=False, message="Document not found."
            )

        if not action.corpus.documents.filter(pk=document.pk).exists():
            return RunCorpusAction(
                ok=False,
                message="Document is not in this action's corpus.",
            )

        # Create execution record
        execution = CorpusActionExecution.objects.create(
            corpus_action=action,
            document=document,
            corpus=action.corpus,
            action_type=CorpusActionExecution.ActionType.AGENT,
            status=CorpusActionExecution.Status.QUEUED,
            trigger=action.trigger,
            queued_at=timezone.now(),
            creator=user,
        )

        # Dispatch Celery task
        run_agent_corpus_action.delay(
            corpus_action_id=action.id,
            document_id=document.id,
            user_id=user.id,
            execution_id=execution.id,
        )

        return RunCorpusAction(
            ok=True,
            message="Action queued successfully.",
            obj=execution,
        )
```

Add the import for `CorpusActionExecutionType` at the top of `mutations.py` alongside the existing `CorpusActionType` import (around line 63):

```python
from config.graphql.graphene_types import (
    ...
    CorpusActionExecutionType,
    ...
)
```

Wire into the `Mutation` class (after line 5976, alongside other corpus action fields):

```python
    run_corpus_action = RunCorpusAction.Field()
```

**Step 4: Run tests to verify they pass**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_run_corpus_action.py -v`
Expected: 5 passed

**Step 5: Run pre-commit**

Run: `pre-commit run --all-files`
Expected: All passed

**Step 6: Commit**

```bash
git add config/graphql/mutations.py opencontractserver/tests/test_run_corpus_action.py
git commit -m "Add RunCorpusAction superuser-only mutation for manual action triggering"
```

---

### Task 2: Frontend — GraphQL Mutation Definition

**Files:**
- Modify: `frontend/src/graphql/mutations.ts` (add mutation + types)

**Step 1: Add the mutation and types**

Add to `frontend/src/graphql/mutations.ts` after the `DELETE_CORPUS_ACTION` mutation (around line 2281):

```typescript
export const RUN_CORPUS_ACTION = gql`
  mutation RunCorpusAction($corpusActionId: ID!, $documentId: ID!) {
    runCorpusAction(
      corpusActionId: $corpusActionId
      documentId: $documentId
    ) {
      ok
      message
      obj {
        id
        status
        actionType
        trigger
        queuedAt
        corpusAction {
          id
          name
        }
        document {
          id
          title
        }
      }
    }
  }
`;

export interface RunCorpusActionInput {
  corpusActionId: string;
  documentId: string;
}

export interface RunCorpusActionOutput {
  runCorpusAction: {
    ok: boolean;
    message: string;
    obj: {
      id: string;
      status: string;
      actionType: string;
      trigger: string;
      queuedAt: string;
      corpusAction: { id: string; name: string };
      document: { id: string; title: string };
    } | null;
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/graphql/mutations.ts
git commit -m "Add RUN_CORPUS_ACTION GraphQL mutation definition"
```

---

### Task 3: Frontend — RunCorpusActionModal Component

**Files:**
- Create: `frontend/src/components/corpuses/RunCorpusActionModal.tsx`

**Step 1: Create the modal component**

Create `frontend/src/components/corpuses/RunCorpusActionModal.tsx`:

```typescript
import React, { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Button, Dropdown, Modal } from "semantic-ui-react";
import { toast } from "react-toastify";

import {
  GET_CORPUS_DOCUMENTS_FOR_TOC,
  GetCorpusDocumentsForTocOutput,
} from "../../graphql/queries";
import {
  RUN_CORPUS_ACTION,
  RunCorpusActionInput,
  RunCorpusActionOutput,
} from "../../graphql/mutations";

interface RunCorpusActionModalProps {
  open: boolean;
  corpusId: string;
  actionId: string;
  actionName: string;
  onClose: () => void;
}

export const RunCorpusActionModal: React.FC<RunCorpusActionModalProps> = ({
  open,
  corpusId,
  actionId,
  actionName,
  onClose,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const { data: docsData, loading: docsLoading } =
    useQuery<GetCorpusDocumentsForTocOutput>(GET_CORPUS_DOCUMENTS_FOR_TOC, {
      variables: { corpusId, first: 500 },
      skip: !open,
    });

  const [runAction, { loading: running }] = useMutation<
    RunCorpusActionOutput,
    RunCorpusActionInput
  >(RUN_CORPUS_ACTION);

  const documentOptions =
    docsData?.documents?.edges?.map(({ node }) => ({
      key: node.id,
      value: node.id,
      text: node.title,
    })) ?? [];

  const handleRun = async () => {
    if (!selectedDocId) return;
    try {
      const { data } = await runAction({
        variables: { corpusActionId: actionId, documentId: selectedDocId },
      });
      if (data?.runCorpusAction?.ok) {
        toast.success("Action queued. Check the execution trail for results.");
        handleClose();
      } else {
        toast.error(data?.runCorpusAction?.message ?? "Failed to queue action.");
      }
    } catch (err) {
      toast.error("Failed to queue action.");
    }
  };

  const handleClose = () => {
    setSelectedDocId(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} size="tiny">
      <Modal.Header>Run: {actionName}</Modal.Header>
      <Modal.Content>
        <p>Select a document to run this action against:</p>
        <Dropdown
          placeholder="Select document..."
          fluid
          search
          selection
          loading={docsLoading}
          options={documentOptions}
          value={selectedDocId ?? undefined}
          onChange={(_, { value }) => setSelectedDocId(value as string)}
        />
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          primary
          loading={running}
          disabled={!selectedDocId || running}
          onClick={handleRun}
        >
          Run
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (may need to check `GetCorpusDocumentsForTocOutput` export — see Step 2 note below)

**Note:** `GetCorpusDocumentsForTocOutput` is defined at `frontend/src/graphql/queries.ts:5012`. Verify it's exported. If the type isn't exported, add `export` to it. The query `GET_CORPUS_DOCUMENTS_FOR_TOC` is already exported at line 5027.

**Step 3: Commit**

```bash
git add frontend/src/components/corpuses/RunCorpusActionModal.tsx
git commit -m "Add RunCorpusActionModal component for manual action triggering"
```

---

### Task 4: Frontend — Wire Run Button into CorpusActionsSection

**Files:**
- Modify: `frontend/src/components/corpuses/settings/CorpusActionsSection.tsx` (add Run button + prop)
- Modify: `frontend/src/components/corpuses/CorpusSettings.tsx` (add modal state + pass callbacks)

**Step 1: Update CorpusActionsSection props and add Run button**

In `frontend/src/components/corpuses/settings/CorpusActionsSection.tsx`:

1. Add `onRunAction` and `isSuperuser` to the props interface:

```typescript
interface CorpusActionsSectionProps {
  actions: CorpusAction[];
  onAddAction: () => void;
  onEditAction: (action: CorpusActionData) => void;
  onDeleteAction: (id: string) => void;
  onRunAction?: (action: CorpusAction) => void;
  isSuperuser?: boolean;
}
```

2. Destructure the new props in the component function.

3. Add a Run button before the Edit button in the action card buttons section (around line 231). The button should:
   - Only render when `isSuperuser` is true
   - Be disabled when the action is NOT an agent action (i.e., when `action.fieldset` or `action.analyzer` is set)
   - Show a tooltip "Only agent actions supported" when disabled
   - Use the `play` icon

```typescript
{isSuperuser && (
  <Button
    icon
    size="tiny"
    disabled={!!action.fieldset || !!action.analyzer}
    title={
      action.fieldset || action.analyzer
        ? "Only agent actions can be manually triggered"
        : "Run this action on a document"
    }
    onClick={() => onRunAction?.(action)}
  >
    <Icon name="play" />
  </Button>
)}
```

**Step 2: Wire up CorpusSettings to manage the RunCorpusActionModal**

In `frontend/src/components/corpuses/CorpusSettings.tsx`:

1. Import `RunCorpusActionModal` and the `CorpusAction` interface type.

2. Add state for the run modal (alongside existing modal state around line 238):

```typescript
const [actionToRun, setActionToRun] = useState<{ id: string; name: string } | null>(null);
```

3. Derive `isSuperuser` from the existing `currentUser` (already available as `backendUserObj`):

```typescript
const isSuperuser = currentUser?.isSuperuser === true;
```

4. Pass `onRunAction` and `isSuperuser` to `CorpusActionsSection`:

```typescript
<CorpusActionsSection
  actions={actions}
  onAddAction={() => setIsModalOpen(true)}
  onEditAction={(action) => {
    setActionToEdit(action);
    setIsModalOpen(true);
  }}
  onDeleteAction={(id) => setActionToDelete(id)}
  onRunAction={(action) => setActionToRun({ id: action.id, name: action.name })}
  isSuperuser={isSuperuser}
/>
```

5. Render the `RunCorpusActionModal` alongside the existing `CreateCorpusActionModal`:

```typescript
{actionToRun && (
  <RunCorpusActionModal
    open={!!actionToRun}
    corpusId={corpus.id}
    actionId={actionToRun.id}
    actionName={actionToRun.name}
    onClose={() => setActionToRun(null)}
  />
)}
```

**Step 3: Verify TypeScript compiles and lint passes**

Run: `cd frontend && npx tsc --noEmit && yarn lint`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/corpuses/settings/CorpusActionsSection.tsx frontend/src/components/corpuses/CorpusSettings.tsx
git commit -m "Wire Run button into corpus action cards with document picker modal"
```

---

### Task 5: Verify End-to-End

**Step 1: Run all backend tests that touch corpus actions**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_run_corpus_action.py opencontractserver/tests/test_corpus_document_actions.py -v`
Expected: All passed (new tests + existing tests unbroken)

**Step 2: Run frontend TypeScript check and linting**

Run: `cd frontend && npx tsc --noEmit && yarn lint`
Expected: No errors

**Step 3: Run pre-commit on all files**

Run: `pre-commit run --all-files`
Expected: All passed

**Step 4: Commit any fixups if needed**

If pre-commit reformats anything:
```bash
git add -u && git commit -m "Fix formatting from pre-commit"
```
