import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import {
  ApprovalModal,
  PendingApproval,
} from "../src/components/corpuses/corpus_chat/ApprovalModal";
import { docScreenshot } from "./utils/docScreenshot";

const sampleApproval: PendingApproval = {
  messageId: "msg-123",
  toolCall: {
    name: "search_documents",
    arguments: { query: "contract terms", limit: 10 },
    tool_call_id: "tc-456",
  },
};

test.describe("ApprovalModal", () => {
  test("renders with pending approval data", async ({ mount, page }) => {
    const component = await mount(
      <ApprovalModal
        pendingApproval={sampleApproval}
        show={true}
        onHide={() => {}}
        onDecision={() => {}}
      />
    );

    await expect(page.getByText("Tool Approval Required")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText("The assistant wants to execute the following tool:")
    ).toBeVisible();
    await expect(page.getByText("Tool: search_documents")).toBeVisible();
    await expect(page.getByText("Arguments:")).toBeVisible();

    // Check action buttons
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

    await docScreenshot(page, "chat--approval-modal--pending");

    await component.unmount();
  });

  test("does not render when show is false", async ({ mount, page }) => {
    const component = await mount(
      <ApprovalModal
        pendingApproval={sampleApproval}
        show={false}
        onHide={() => {}}
        onDecision={() => {}}
      />
    );

    await expect(page.getByText("Tool Approval Required")).not.toBeVisible();

    await component.unmount();
  });

  test("does not render when pendingApproval is null", async ({
    mount,
    page,
  }) => {
    const component = await mount(
      <ApprovalModal
        pendingApproval={null}
        show={true}
        onHide={() => {}}
        onDecision={() => {}}
      />
    );

    await expect(page.getByText("Tool Approval Required")).not.toBeVisible();

    await component.unmount();
  });

  test("calls onDecision with true when Approve is clicked", async ({
    mount,
    page,
  }) => {
    let decision: boolean | null = null;

    const component = await mount(
      <ApprovalModal
        pendingApproval={sampleApproval}
        show={true}
        onHide={() => {}}
        onDecision={(approved) => {
          decision = approved;
        }}
      />
    );

    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Approve" }).click();

    expect(decision).toBe(true);

    await component.unmount();
  });

  test("calls onDecision with false when Reject is clicked", async ({
    mount,
    page,
  }) => {
    let decision: boolean | null = null;

    const component = await mount(
      <ApprovalModal
        pendingApproval={sampleApproval}
        show={true}
        onHide={() => {}}
        onDecision={(approved) => {
          decision = approved;
        }}
      />
    );

    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Reject" }).click();

    expect(decision).toBe(false);

    await component.unmount();
  });

  test("displays tool arguments as JSON", async ({ mount, page }) => {
    const component = await mount(
      <ApprovalModal
        pendingApproval={sampleApproval}
        show={true}
        onHide={() => {}}
        onDecision={() => {}}
      />
    );

    // The arguments should be displayed as formatted JSON
    await expect(page.getByText('"contract terms"')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("10")).toBeVisible();

    await component.unmount();
  });
});
