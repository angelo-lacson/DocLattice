// Playwright Component Test for ChatMessage Processing Indicator
// Tests the processing indicator feature added in issue #687
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { ChatMessage } from "../src/components/widgets/chat/ChatMessage";

// Mock props for different message states
const baseAssistantMessage = {
  user: "Assistant",
  timestamp: new Date().toLocaleString(),
  isAssistant: true,
};

const baseUserMessage = {
  user: "testuser@example.com",
  timestamp: new Date().toLocaleString(),
  isAssistant: false,
};

test.describe("ChatMessage Processing Indicator", () => {
  test("should show processing indicator when assistant message is incomplete with no content", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content=""
        isComplete={false}
        timeline={[]}
      />,
    );

    // Processing indicator should be visible
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).toBeVisible({ timeout: 3000 });

    // "Agent is thinking..." text should be visible
    await expect(page.locator("text=Agent is thinking...")).toBeVisible();

    // Message content bubble should NOT be visible
    await expect(page.locator(".message-content")).not.toBeVisible();

    await component.unmount();
  });

  test("should have correct ARIA attributes for accessibility", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content=""
        isComplete={false}
        timeline={[]}
      />,
    );

    const indicator = page.locator('[data-testid="processing-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 3000 });

    // Check ARIA attributes
    await expect(indicator).toHaveAttribute("role", "status");
    await expect(indicator).toHaveAttribute("aria-live", "polite");
    await expect(indicator).toHaveAttribute(
      "aria-label",
      "Agent is processing your request",
    );

    await component.unmount();
  });

  test("should hide processing indicator when content arrives", async ({
    mount,
    page,
  }) => {
    // First mount with no content
    const component = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content=""
        isComplete={false}
        timeline={[]}
      />,
    );

    // Processing indicator should be visible initially
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).toBeVisible({ timeout: 3000 });

    await component.unmount();

    // Now mount with content
    const componentWithContent = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content="Hello, I can help you with that."
        isComplete={false}
        timeline={[]}
      />,
    );

    // Processing indicator should NOT be visible
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).not.toBeVisible();

    // Message content should be visible
    await expect(
      page.locator("text=Hello, I can help you with that."),
    ).toBeVisible();

    await componentWithContent.unmount();
  });

  test("should show timeline instead of processing indicator when timeline arrives first", async ({
    mount,
    page,
  }) => {
    const timelineEntries = [
      {
        type: "thought" as const,
        text: "Analyzing the user request",
      },
    ];

    const component = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content=""
        isComplete={false}
        timeline={timelineEntries}
        hasTimeline={true}
      />,
    );

    // Processing indicator should NOT be visible
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).not.toBeVisible();

    // Timeline should be visible
    await expect(page.locator(".timeline-container")).toBeVisible({
      timeout: 3000,
    });

    // Timeline entry should show
    await expect(page.locator("text=Thinking")).toBeVisible();

    await component.unmount();
  });

  test("should NOT show processing indicator for user messages", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <ChatMessage
        {...baseUserMessage}
        content=""
        isComplete={false}
        timeline={[]}
      />,
    );

    // Processing indicator should NOT be visible for user messages
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).not.toBeVisible();

    await component.unmount();
  });

  test("should NOT show processing indicator when message is complete", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content="Here is my response."
        isComplete={true}
        timeline={[]}
      />,
    );

    // Processing indicator should NOT be visible when message is complete
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).not.toBeVisible();

    // Message content should be visible
    await expect(page.locator("text=Here is my response.")).toBeVisible();

    await component.unmount();
  });

  test("should show animated dots in processing indicator", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <ChatMessage
        {...baseAssistantMessage}
        content=""
        isComplete={false}
        timeline={[]}
      />,
    );

    // Processing indicator should be visible
    await expect(
      page.locator('[data-testid="processing-indicator"]'),
    ).toBeVisible({ timeout: 3000 });

    // Should have three animated dots (the dots are span elements inside ProcessingDots)
    const dots = page.locator('[data-testid="processing-indicator"] span');
    // ProcessingDots has 3 ProcessingDot children plus the ProcessingText
    await expect(dots).toHaveCount(4); // 3 dots + 1 text span

    await component.unmount();
  });
});
