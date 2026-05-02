import { test, expect } from "./utils/coverage";
import { docScreenshot } from "./utils/docScreenshot";
import { MCPShareButton } from "../src/components/common/MCPShareButton";
import { MCPShareButtonTestWrapper } from "./MCPShareButtonTestWrapper";

test.describe("MCPShareButton", () => {
  test("renders public variant with Cable icon and endpoint URL", async ({
    mount,
    page,
  }) => {
    await mount(
      <MCPShareButtonTestWrapper>
        <MCPShareButton corpusSlug="my-public-corpus" isPublic={true} />
      </MCPShareButtonTestWrapper>
    );

    const trigger = page.getByTestId("mcp-share-button-trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-label", "Share MCP endpoint");

    await trigger.click();

    const urlInput = page.getByTestId("mcp-share-button-url-input");
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue(/\/mcp\/corpus\/my-public-corpus$/);

    await expect(
      page.getByTestId("mcp-share-button-copy-button")
    ).toBeVisible();
    await expect(
      page.getByText("Add this URL to your MCP client configuration.")
    ).toBeVisible();

    await docScreenshot(page, "corpus--mcp-share-button--public");
  });

  test("renders private variant with Lock icon and explanation", async ({
    mount,
    page,
  }) => {
    await mount(
      <MCPShareButtonTestWrapper>
        <MCPShareButton corpusSlug="my-private-corpus" isPublic={false} />
      </MCPShareButtonTestWrapper>
    );

    const trigger = page.getByTestId("mcp-share-button-trigger");
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute(
      "aria-label",
      "MCP endpoint (corpus is private)"
    );

    await trigger.click();

    await expect(
      page.getByText(
        "MCP endpoints are only exposed for public corpora. Make this corpus public from its settings to share it via the Model Context Protocol."
      )
    ).toBeVisible();
    await expect(
      page.getByText(
        "Once public, the endpoint will appear here for AI assistants to connect."
      )
    ).toBeVisible();

    await expect(page.getByTestId("mcp-share-button-url-input")).toHaveCount(0);
    await expect(page.getByTestId("mcp-share-button-copy-button")).toHaveCount(
      0
    );

    await docScreenshot(page, "corpus--mcp-share-button--private");
  });

  test("toggles popover on repeated clicks", async ({ mount, page }) => {
    await mount(
      <MCPShareButtonTestWrapper>
        <MCPShareButton corpusSlug="toggleable" isPublic={true} />
      </MCPShareButtonTestWrapper>
    );

    const trigger = page.getByTestId("mcp-share-button-trigger");
    await trigger.click();
    await expect(page.getByTestId("mcp-share-button-url-input")).toBeVisible();

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
