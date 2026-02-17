# Corpus Action Configuration Screenshots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add auto-generated documentation screenshots for the full corpus action configuration flow and update docs to reference them.

**Architecture:** Add `docScreenshot()` calls to existing Playwright component tests for `CreateCorpusActionModal`, create a new component test for `CorpusActionsSection` list view, and replace manual screenshot references in `intro_to_corpus_actions.md` with auto-generated ones.

**Tech Stack:** Playwright component tests, `docScreenshot` utility, Semantic UI React

---

### Task 1: Add docScreenshot import and initial state screenshot to create-corpus-action-modal test

**Files:**
- Modify: `frontend/tests/create-corpus-action-modal.ct.tsx`

**Step 1: Add import**

At the top of the file, after the existing imports, add:

```typescript
import { docScreenshot } from "./utils/docScreenshot";
```

**Step 2: Add screenshot to the "should default to 'On Document Add' trigger" test**

In the test at line 165, after the assertion `await expect(triggerDropdown).toContainText("On Document Add");` (line 184), add:

```typescript
    await docScreenshot(page, "corpus-actions--create-modal--initial", {
      fullPage: true,
    });
```

**Step 3: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should default to"`
Expected: PASS, screenshot file created at `docs/assets/images/screenshots/auto/corpus-actions--create-modal--initial.png`

---

### Task 2: Add fieldset config screenshot

**Files:**
- Modify: `frontend/tests/create-corpus-action-modal.ct.tsx`

**Step 1: Add screenshot to fieldset configuration test**

In the "should show fieldset configuration for fieldset action type" test (line 733), after the assertion `await expect(page.locator("text=Select a fieldset to automatically extract data")).toBeVisible();` (line 752), add:

```typescript
    await docScreenshot(page, "corpus-actions--create-modal--fieldset-config", {
      fullPage: true,
    });
```

**Step 2: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should show fieldset configuration"`
Expected: PASS, screenshot created

---

### Task 3: Add analyzer config screenshot

**Files:**
- Modify: `frontend/tests/create-corpus-action-modal.ct.tsx`

**Step 1: Add screenshot to analyzer configuration test**

In the "should show analyzer configuration for analyzer action type" test (line 758), after the assertion `await expect(page.locator("text=Select an analyzer to automatically run analysis")).toBeVisible();` (line 789), add:

```typescript
    await docScreenshot(page, "corpus-actions--create-modal--analyzer-config", {
      fullPage: true,
    });
```

**Step 2: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should show analyzer configuration"`
Expected: PASS, screenshot created

---

### Task 4: Add agent with document trigger screenshot

**Files:**
- Modify: `frontend/tests/create-corpus-action-modal.ct.tsx`

**Step 1: Add screenshot to "should show pre-authorized tools dropdown" test**

In the test at line 513, after the assertion `await expect(page.locator("small:has-text('Pre-authorized tools will execute')")).toBeVisible();` (line 558), add:

```typescript
    await docScreenshot(page, "corpus-actions--create-modal--agent-document", {
      fullPage: true,
    });
```

**Step 2: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should show pre-authorized tools"`
Expected: PASS, screenshot created

---

### Task 5: Add agent with thread trigger (quick-create moderator) screenshot

**Files:**
- Modify: `frontend/tests/create-corpus-action-modal.ct.tsx`

**Step 1: Add screenshot to "should show moderation-specific info message" test**

In the test at line 272, after the assertion `await expect(page.locator("text=Lock thread to prevent").first()).toBeVisible();` (line 307), add:

```typescript
    await docScreenshot(page, "corpus-actions--create-modal--agent-thread-quick", {
      fullPage: true,
    });
```

**Step 2: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should show moderation-specific"`
Expected: PASS, screenshot created

---

### Task 6: Add agent with thread trigger (use existing agent) screenshot

**Files:**
- Modify: `frontend/tests/create-corpus-action-modal.ct.tsx`

**Step 1: Add new test for existing agent mode with thread trigger**

Add a new test inside the "Thread Trigger Behavior" describe block, after the existing tests (after line 343):

```typescript
  test("should show existing agent mode for thread triggers", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <MockedProvider mocks={createStandardMocks()} addTypename={false}>
        <CreateCorpusActionModal
          corpusId="Q29ycHVzVHlwZTox"
          open={true}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </MockedProvider>
    );

    // Select "On New Thread" trigger
    const triggerDropdown = page.locator(
      '.field:has(label:text("Trigger")) div.ui.dropdown'
    );
    await triggerDropdown.click();
    await page.locator('[role="option"]:has-text("On New Thread")').click();

    await page.waitForTimeout(500);

    // Switch to "Use Existing Agent" mode
    await page.locator("text=Use Existing Agent").click();
    await page.waitForTimeout(300);

    // Should show existing agent selection UI
    await expect(
      page.locator("text=Select agent configuration")
    ).toBeVisible();

    await docScreenshot(
      page,
      "corpus-actions--create-modal--agent-thread-existing",
      { fullPage: true }
    );

    await component.unmount();
  });
```

**Step 2: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should show existing agent mode"`
Expected: PASS, screenshot created

---

### Task 7: Create CorpusActionsSection list view test with screenshot

**Files:**
- Create: `frontend/tests/corpus-actions-list.ct.tsx`

**Step 1: Write the test file**

```typescript
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { CorpusActionsSection } from "../src/components/corpuses/settings/CorpusActionsSection";
import { docScreenshot } from "./utils/docScreenshot";

const mockActions = [
  {
    id: "action-1",
    name: "Auto-Summarize Documents",
    trigger: "add_document",
    disabled: false,
    runOnAllCorpuses: false,
    agentConfig: {
      id: "agent-1",
      name: "Document Summarizer",
      description: "Summarizes documents on upload",
    },
    taskInstructions:
      "Read the document and create a concise summary highlighting key points, parties, and important dates.",
    preAuthorizedTools: [
      "load_document_text",
      "update_document_summary",
    ],
    creator: { username: "admin" },
    created: "2026-01-15T10:00:00Z",
  },
  {
    id: "action-2",
    name: "Extract Contract Terms",
    trigger: "add_document",
    disabled: false,
    runOnAllCorpuses: false,
    fieldset: { id: "fs-1", name: "Contract Terms Fieldset" },
    creator: { username: "admin" },
    created: "2026-01-20T14:30:00Z",
  },
  {
    id: "action-3",
    name: "Thread Moderator",
    trigger: "new_thread",
    disabled: true,
    runOnAllCorpuses: false,
    agentConfig: {
      id: "agent-2",
      name: "Content Moderator",
      description: "Moderates discussion threads",
    },
    taskInstructions:
      "Review new threads for policy compliance. Use moderation tools as needed.",
    preAuthorizedTools: [
      "get_thread_context",
      "get_thread_messages",
      "delete_message",
      "lock_thread",
    ],
    creator: { username: "moderator" },
    created: "2026-02-01T09:15:00Z",
  },
];

test.describe("CorpusActionsSection - List View", () => {
  test("should display action cards with details", async ({ mount, page }) => {
    const component = await mount(
      <CorpusActionsSection
        actions={mockActions}
        onAddAction={() => {}}
        onEditAction={() => {}}
        onDeleteAction={() => {}}
      />
    );

    // Verify all actions are displayed
    await expect(page.locator("text=Auto-Summarize Documents")).toBeVisible();
    await expect(page.locator("text=Extract Contract Terms")).toBeVisible();
    await expect(page.locator("text=Thread Moderator")).toBeVisible();

    // Verify action type info
    await expect(
      page.locator("text=Agent: Document Summarizer")
    ).toBeVisible();
    await expect(
      page.locator("text=Fieldset: Contract Terms Fieldset")
    ).toBeVisible();

    // Verify status badges
    await expect(page.locator("text=Disabled")).toBeVisible();

    await docScreenshot(page, "corpus-actions--list-view--with-actions", {
      fullPage: true,
    });

    await component.unmount();
  });
});
```

**Step 2: Run test to verify**

Run: `cd frontend && yarn test:ct --reporter=list -g "should display action cards"`
Expected: PASS, screenshot created

---

### Task 8: Update documentation to use auto-generated screenshots

**Files:**
- Modify: `docs/corpus_actions/intro_to_corpus_actions.md`

**Step 1: Replace the manual screenshot reference**

Replace line 31:
```markdown
![Corpus Actions](../assets/images/screenshots/Corpus_Action_Settings.png)
```

With a section showing the key configuration screenshots:

```markdown
### Action List View

The settings tab shows all configured actions with their type, trigger, status, and task instructions:

![Corpus Actions List](../assets/images/screenshots/auto/corpus-actions--list-view--with-actions.png)

### Creating a New Action

Click **Add Action** to open the creation modal. The default view shows fieldset configuration:

![Create Action - Fieldset](../assets/images/screenshots/auto/corpus-actions--create-modal--fieldset-config.png)

Switch to **Analyzer** for classification actions:

![Create Action - Analyzer](../assets/images/screenshots/auto/corpus-actions--create-modal--analyzer-config.png)

Switch to **Agent** for AI-powered actions with pre-authorized tools:

![Create Action - Agent](../assets/images/screenshots/auto/corpus-actions--create-modal--agent-document.png)

### Thread Moderation Actions

For thread/message triggers, a quick-create moderator mode is available with pre-selected moderation tools:

![Create Action - Thread Moderator](../assets/images/screenshots/auto/corpus-actions--create-modal--agent-thread-quick.png)

Or select an existing agent configuration:

![Create Action - Existing Agent](../assets/images/screenshots/auto/corpus-actions--create-modal--agent-thread-existing.png)
```

**Step 2: Verify markdown renders correctly**

Visually inspect that the image paths are correct relative to the doc file location.

---

### Task 9: Run all corpus action tests and commit

**Step 1: Run all create-corpus-action-modal tests**

Run: `cd frontend && yarn test:ct --reporter=list -g "CreateCorpusActionModal"`
Expected: All tests PASS

**Step 2: Run the new list view test**

Run: `cd frontend && yarn test:ct --reporter=list -g "CorpusActionsSection"`
Expected: PASS

**Step 3: Verify all screenshots were generated**

Check that these files exist:
- `docs/assets/images/screenshots/auto/corpus-actions--create-modal--initial.png`
- `docs/assets/images/screenshots/auto/corpus-actions--create-modal--fieldset-config.png`
- `docs/assets/images/screenshots/auto/corpus-actions--create-modal--analyzer-config.png`
- `docs/assets/images/screenshots/auto/corpus-actions--create-modal--agent-document.png`
- `docs/assets/images/screenshots/auto/corpus-actions--create-modal--agent-thread-quick.png`
- `docs/assets/images/screenshots/auto/corpus-actions--create-modal--agent-thread-existing.png`
- `docs/assets/images/screenshots/auto/corpus-actions--list-view--with-actions.png`

**Step 4: Commit**

Stage and commit all changes.
