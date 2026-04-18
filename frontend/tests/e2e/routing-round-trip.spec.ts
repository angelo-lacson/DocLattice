/**
 * E2E integration test: routing round-trip (URL → entity → back).
 *
 * This spec targets Issue #1285's coverage requirement that at least one
 * E2E spec exercises the full routing round-trip: navigate to a
 * deep-linked URL, let `CentralRouteManager` resolve it into the
 * corresponding reactive-var entity, then navigate back and verify the
 * URL + entity state both roll back correctly.
 *
 * The views traversed here are:
 *   - `Corpuses`  (route: /corpuses → /c/<user-slug>/<corpus-slug>)
 *   - `Documents` (route: /documents → /d/<user-slug>/<doc-slug>)
 *
 * It runs AFTER corpus-workflow.spec.ts (alphabetical order) so that the
 * database already contains a corpus and document created by that spec.
 *
 * Expected touchpoints:
 *   - `App.tsx`                       (top-level route → view dispatch)
 *   - `CentralRouteManager`           (URL ↔ reactive var sync)
 *   - `CorpusLandingRoute`            (slug → entity + loading/error wiring)
 *   - `DocumentLandingRoute`          (slug → entity)
 *   - `NotFound`                      (unknown-route fallback)
 */

import { test, expect } from "./fixtures";
import {
  TEST_USER,
  loginViaUI,
  spaNavigate,
  expectViewVisible,
} from "./helpers";

// Must match the titles used by corpus-workflow.spec.ts.
const CORPUS_TITLE = "E2E Test Corpus";
const DOC_TITLE = "E2E Test Document";

test.describe("Routing round-trip", () => {
  test("deep-links a corpus, navigates back, then deep-links a document", async ({
    page,
  }) => {
    await test.step("login", async () => {
      await loginViaUI(page, TEST_USER.username, TEST_USER.password);
    });

    // ── 1. URL → entity: list view shows seeded corpus ────────────────
    let corpusHref: string | null = null;
    await test.step("/corpuses list renders the seeded corpus and captures its slug link", async () => {
      await spaNavigate(page, "/corpuses");
      await expectViewVisible(page, {
        kind: "text",
        text: /Your\s+corpuses/i,
      });

      const corpusCard = page.getByText(CORPUS_TITLE).first();
      await expect(corpusCard).toBeVisible({ timeout: 20_000 });

      // Click into the corpus detail — this is the URL → entity transition
      await corpusCard.click();

      // CentralRouteManager resolves the slug and populates `openedCorpus`.
      // We verify the URL changed to /c/... AND the UI reflects the entity.
      await expect(page).toHaveURL(/\/c\/[^/]+\/[^/?]+/, { timeout: 20_000 });
      corpusHref = page.url();

      // The corpus detail page is landing on `CorpusLandingRoute` → `Corpuses`
      // view. A stable sentinel is the Documents / Annotations tab header or
      // the corpus title in the hero.
      await expect(page.getByText(CORPUS_TITLE).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    // ── 2. entity → URL → back: popstate pop to the list view ─────────
    await test.step("browser-back from the corpus detail returns to /corpuses", async () => {
      // We SPA-navigated via click above, so history.back() is the mirror
      // operation. React Router v6 listens to popstate; CentralRouteManager
      // clears `openedCorpus` when the URL no longer matches /c/..../...
      await page.goBack();
      await expect(page).toHaveURL(/\/corpuses(?:\?.*)?$/, { timeout: 15_000 });
      await expectViewVisible(page, {
        kind: "text",
        text: /Your\s+corpuses/i,
      });
      // And the corpus should still be in the list on return.
      await expect(page.getByText(CORPUS_TITLE).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // ── 3. Deep-link replay by re-navigating to the captured URL ──────
    await test.step("re-deep-linking the same URL re-renders the corpus detail", async () => {
      if (!corpusHref) throw new Error("expected corpusHref to be captured");
      const slugPath = new URL(corpusHref).pathname;
      await spaNavigate(page, slugPath);
      await expect(page).toHaveURL(
        new RegExp(slugPath.replace(/[/]/g, "\\/")),
        {
          timeout: 15_000,
        }
      );
      await expect(page.getByText(CORPUS_TITLE).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    // ── 4. URL → entity for a document ────────────────────────────────
    let docHref: string | null = null;
    await test.step("/documents list resolves to a document deep-link", async () => {
      await spaNavigate(page, "/documents");
      await expectViewVisible(page, {
        kind: "text",
        text: /Your\s+documents/i,
      });

      const docCard = page.getByText(DOC_TITLE).first();
      await expect(docCard).toBeVisible({ timeout: 20_000 });
      await docCard.click();

      // The document opens in a knowledge-base modal whose URL should be
      // /d/<user>/<doc-slug>. Capture it for the round-trip check.
      await expect(page).toHaveURL(/\/d\/[^/]+\/[^/?]+/, { timeout: 20_000 });
      docHref = page.url();

      // Knowledge base sentinel — the INDEX sidebar tab label is stable.
      await expect(page.getByText(/INDEX/i).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    // ── 5. Round-trip back to the list ────────────────────────────────
    await test.step("closing the document deep-link returns to /documents", async () => {
      await page.goBack();
      await expect(page).toHaveURL(/\/documents(?:\?.*)?$/, {
        timeout: 15_000,
      });
      await expectViewVisible(page, {
        kind: "text",
        text: /Your\s+documents/i,
      });
    });

    // ── 6. Unknown route → NotFound fallback ──────────────────────────
    await test.step("navigating to an unknown route renders the 404 fallback", async () => {
      await spaNavigate(page, "/this-route-does-not-exist");
      await expect(page.getByText(/404 .*Not Found/i)).toBeVisible({
        timeout: 15_000,
      });
      // The 'Go to Corpuses' button should bounce us back.
      await page.getByRole("button", { name: /Go to Corpuses/i }).click();
      await expect(page).toHaveURL(/\/corpuses(?:\?.*)?$/, {
        timeout: 15_000,
      });
    });
  });
});
