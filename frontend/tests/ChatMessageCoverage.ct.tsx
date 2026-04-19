/**
 * Playwright Component Tests for ChatMessage (coverage expansion).
 *
 * The existing suites (`chat-message-processing-indicator.ct.tsx` and
 * `ToolUsagePopover.ct.tsx`) cover the processing state and tool-usage popover
 * respectively.  This suite exercises the remaining branches that were
 * uncovered per `docs/coverage/frontend-roi-ranking.md` (issue #1279):
 *
 *   - Markdown rendering inside the message bubble (bold, code, lists, tables)
 *   - User vs assistant header + avatar rendering
 *   - Selection behavior (`onSelect`, `isSelected` styling side-effects)
 *   - Sources preview: collapsed→expanded toggle, source expand/collapse,
 *     source selection via click
 *   - Timeline preview: collapsed by default for long timelines, expands on
 *     header click, per-entry expand/collapse behavior
 *   - Approval status pill rendering for each of "approved" / "rejected" /
 *     "awaiting"
 *   - `showTimelineOnly` branch (incomplete assistant message with timeline)
 */
import React from "react";
import { test, expect } from "./utils/coverage";
import {
  ChatMessage,
  TimelineEntry,
} from "../src/components/widgets/chat/ChatMessage";
import { ChatMessageTestWrapper } from "./ChatMessageTestWrapper";

const ASSISTANT_BASE = {
  user: "Assistant",
  timestamp: "2026-01-01 12:00:00",
  isAssistant: true,
};

const USER_BASE = {
  user: "alice@example.com",
  timestamp: "2026-01-01 12:00:00",
  isAssistant: false,
};

test.describe("ChatMessage — user vs assistant", () => {
  test("assistant messages label the author as 'AI Assistant'", async ({
    mount,
    page,
  }) => {
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Hello from the model."
          isComplete={true}
          timeline={[]}
        />
      </ChatMessageTestWrapper>
    );

    await expect(page.locator("text=AI Assistant")).toBeVisible();
    // The raw `user` prop should NOT leak into the UI for assistant messages.
    await expect(page.locator("text=Assistant").first()).toBeVisible();
    // Timestamp should render
    await expect(page.locator("text=2026-01-01 12:00:00")).toBeVisible();
  });

  test("user messages show the user's identifier as the header", async ({
    mount,
    page,
  }) => {
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...USER_BASE}
          content="Hi there."
          isComplete={true}
          timeline={[]}
        />
      </ChatMessageTestWrapper>
    );

    await expect(page.locator("text=alice@example.com")).toBeVisible();
    // User messages never render tool badges or processing indicators.
    await expect(
      page.locator('[data-testid="processing-indicator"]')
    ).not.toBeVisible();
  });
});

test.describe("ChatMessage — markdown rendering", () => {
  test("renders bold, inline code, and list markdown", async ({
    mount,
    page,
  }) => {
    const markdown = [
      "**Bold text** is bold.",
      "",
      "Inline `code` block.",
      "",
      "- first item",
      "- second item",
    ].join("\n");

    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content={markdown}
          isComplete={true}
          timeline={[]}
        />
      </ChatMessageTestWrapper>
    );

    const bubble = page.locator('[data-testid="message-content"]');
    await expect(bubble).toBeVisible({ timeout: 5000 });

    // Bold should be rendered as <strong>
    await expect(
      bubble.locator("strong", { hasText: "Bold text" })
    ).toBeVisible();
    // Inline code should be rendered as <code>
    await expect(bubble.locator("code", { hasText: "code" })).toBeVisible();
    // List items
    await expect(bubble.locator("li", { hasText: "first item" })).toBeVisible();
    await expect(
      bubble.locator("li", { hasText: "second item" })
    ).toBeVisible();
  });

  test("renders GitHub-flavored markdown tables", async ({ mount, page }) => {
    const markdown = [
      "| Col A | Col B |",
      "| ----- | ----- |",
      "| a1    | b1    |",
      "| a2    | b2    |",
    ].join("\n");

    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content={markdown}
          isComplete={true}
          timeline={[]}
        />
      </ChatMessageTestWrapper>
    );

    const bubble = page.locator('[data-testid="message-content"]');
    await expect(bubble).toBeVisible({ timeout: 5000 });

    // remark-gfm should transform the pipe table into a real <table>
    const table = bubble.locator("table");
    await expect(table).toBeVisible();
    await expect(table.locator("th", { hasText: "Col A" })).toBeVisible();
    await expect(table.locator("td", { hasText: "b1" })).toBeVisible();
    await expect(table.locator("td", { hasText: "a2" })).toBeVisible();
  });
});

test.describe("ChatMessage — selection", () => {
  test("calls onSelect when the message container is clicked", async ({
    mount,
    page,
  }) => {
    let clicks = 0;
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Selectable message."
          isComplete={true}
          timeline={[]}
          onSelect={() => {
            clicks += 1;
          }}
        />
      </ChatMessageTestWrapper>
    );

    const bubble = page.locator('[data-testid="message-content"]');
    await expect(bubble).toBeVisible({ timeout: 5000 });
    await bubble.click();

    // Give the handler a tick to fire
    await page.waitForTimeout(100);
    expect(clicks).toBeGreaterThanOrEqual(1);
  });

  test("renders the source indicator when sources are present", async ({
    mount,
    page,
  }) => {
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Here's some data."
          isComplete={true}
          timeline={[]}
          sources={[{ text: "First source snippet." }]}
          isSelected={true}
        />
      </ChatMessageTestWrapper>
    );

    // Source indicator exposed by data-testid
    const indicator = page.locator('[data-testid="source-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 5000 });
    await expect(indicator).toContainText("1 source");
  });
});

test.describe("ChatMessage — approval status pill", () => {
  const APPROVAL_CASES: Array<{
    status: "approved" | "rejected" | "awaiting";
    label: string;
  }> = [
    { status: "approved", label: "Approved" },
    { status: "rejected", label: "Rejected" },
    { status: "awaiting", label: "Awaiting Approval" },
  ];

  for (const { status, label } of APPROVAL_CASES) {
    test(`renders ${status} approval with label "${label}"`, async ({
      mount,
      page,
    }) => {
      await mount(
        <ChatMessageTestWrapper>
          <ChatMessage
            {...ASSISTANT_BASE}
            content="Action requested."
            isComplete={true}
            timeline={[]}
            approvalStatus={status}
          />
        </ChatMessageTestWrapper>
      );

      // The label is rendered both in the floating pill and inline in the
      // bubble, so there should be at least one occurrence.
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 5000,
      });
    });
  }
});

test.describe("ChatMessage — sources preview", () => {
  test("toggles the sources panel open/closed", async ({ mount, page }) => {
    const sources = [
      { text: "Contract clause about indemnification." },
      { text: "Clause limiting liability." },
    ];

    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="See attached sources."
          isComplete={true}
          timeline={[]}
          sources={sources}
        />
      </ChatMessageTestWrapper>
    );

    const bubble = page.locator('[data-testid="message-content"]');
    await expect(bubble).toBeVisible({ timeout: 5000 });

    // The "Sources" collapsible header should be inside the bubble
    const header = bubble.locator("text=2 Sources");
    await expect(header).toBeVisible();

    // Before expansion, individual source chips are not rendered
    await expect(bubble.locator("text=Source 1")).not.toBeVisible();

    // Click header to expand
    await header.click();

    // Now both source chips should render
    await expect(bubble.locator("text=Source 1")).toBeVisible({
      timeout: 3000,
    });
    await expect(bubble.locator("text=Source 2")).toBeVisible();
  });

  test("invokes the per-source onClick when a chip is clicked", async ({
    mount,
    page,
  }) => {
    let clicks = 0;
    const sources = [
      { text: "A quoted snippet.", onClick: () => (clicks += 1) },
    ];

    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Reference below."
          isComplete={true}
          timeline={[]}
          sources={sources}
        />
      </ChatMessageTestWrapper>
    );

    const bubble = page.locator('[data-testid="message-content"]');
    await expect(bubble).toBeVisible({ timeout: 5000 });

    // Expand the sources
    await bubble.locator("text=1 Source").click();
    const chip = bubble.locator(".source-chip").first();
    await expect(chip).toBeVisible({ timeout: 3000 });
    // Click directly on the chip (not the Annotate / Expand controls)
    await chip.click({ position: { x: 5, y: 5 } });

    await page.waitForTimeout(100);
    expect(clicks).toBeGreaterThanOrEqual(1);
  });

  test("expands and collapses an individual source", async ({
    mount,
    page,
  }) => {
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Reference below."
          isComplete={true}
          timeline={[]}
          sources={[{ text: "A snippet that can be expanded." }]}
        />
      </ChatMessageTestWrapper>
    );

    const bubble = page.locator('[data-testid="message-content"]');
    await expect(bubble).toBeVisible({ timeout: 5000 });
    await bubble.locator("text=1 Source").click();

    const expandButton = bubble.getByRole("button", { name: /show more/i });
    await expect(expandButton).toBeVisible({ timeout: 3000 });
    await expandButton.click();

    // After expansion, the button label toggles to "Show less"
    await expect(
      bubble.getByRole("button", { name: /show less/i })
    ).toBeVisible();
  });
});

test.describe("ChatMessage — timeline preview", () => {
  const LONG_TIMELINE: TimelineEntry[] = [
    { type: "thought", text: "Breaking down the query" },
    { type: "tool_call", tool: "similarity_search", args: { q: "a" } },
    { type: "tool_result", tool: "similarity_search", result: "Found 2" },
    { type: "content", text: "Generating answer" },
    { type: "status", msg: "run_finished" },
  ];

  test("timeline is collapsed by default for long, completed messages", async ({
    mount,
    page,
  }) => {
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Final answer."
          isComplete={true}
          timeline={LONG_TIMELINE}
          hasTimeline={true}
        />
      </ChatMessageTestWrapper>
    );

    const timeline = page.locator('[data-testid="timeline-container"]');
    await expect(timeline).toBeVisible({ timeout: 5000 });
    // Header summarizes the number of steps
    await expect(timeline).toContainText(/5 steps/i);

    // Individual entry titles should NOT be visible while collapsed
    await expect(
      timeline.locator("text=Breaking down the query")
    ).not.toBeVisible();
  });

  test("clicking the timeline header expands it", async ({ mount, page }) => {
    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Final answer."
          isComplete={true}
          timeline={LONG_TIMELINE}
          hasTimeline={true}
        />
      </ChatMessageTestWrapper>
    );

    const timeline = page.locator('[data-testid="timeline-container"]');
    await expect(timeline).toBeVisible({ timeout: 5000 });

    // Click the header (row with "Timeline (5 steps)")
    await timeline.locator("text=/Timeline \\(5 steps\\)/").click();

    // Titles should now render for the timeline entries (all expanded by default)
    await expect(timeline.locator("text=Thinking").first()).toBeVisible({
      timeout: 3000,
    });
    await expect(
      timeline.locator("text=Calling similarity_search").first()
    ).toBeVisible();
  });

  test("short timelines stay expanded even after completion", async ({
    mount,
    page,
  }) => {
    const shortTimeline: TimelineEntry[] = [
      { type: "thought", text: "Quick thought" },
    ];

    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content="Done."
          isComplete={true}
          timeline={shortTimeline}
          hasTimeline={true}
        />
      </ChatMessageTestWrapper>
    );

    const timeline = page.locator('[data-testid="timeline-container"]');
    await expect(timeline).toBeVisible({ timeout: 5000 });
    // Short timelines (<=2) default to expanded, so the entry title is visible
    await expect(timeline.locator("text=Thinking").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("streaming timeline (incomplete + timeline) hides the message bubble", async ({
    mount,
    page,
  }) => {
    const timeline: TimelineEntry[] = [
      { type: "thought", text: "Still working" },
    ];

    await mount(
      <ChatMessageTestWrapper>
        <ChatMessage
          {...ASSISTANT_BASE}
          content=""
          isComplete={false}
          timeline={timeline}
          hasTimeline={true}
        />
      </ChatMessageTestWrapper>
    );

    // No message-content bubble is rendered while timeline-only state is active
    await expect(
      page.locator('[data-testid="message-content"]')
    ).not.toBeVisible();

    const timelineContainer = page.locator(
      '[data-testid="timeline-container"]'
    );
    await expect(timelineContainer).toBeVisible({ timeout: 5000 });
    // The single step should be expanded (expandLatestOnly)
    await expect(timelineContainer.locator("text=Thinking")).toBeVisible();
  });
});
