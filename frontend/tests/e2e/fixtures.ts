/**
 * E2E Playwright fixtures.
 *
 * Extends the base @playwright/test runtime with:
 *   1. Istanbul coverage collection from a real (non-CT) browser session.
 *   2. A small set of helpers that are useful across the navigation specs.
 *
 * The coverage collection mirrors the pattern used by the component-test
 * fixture in `tests/utils/coverage.ts` but is separate because the imports
 * differ (`@playwright/test` here vs `@playwright/experimental-ct-react`
 * there) and the temp directory is also distinct so the two coverage
 * streams can be merged or reported on independently.
 *
 * Coverage data is dumped to `frontend/coverage/e2e/.nyc_output/<uuid>.json`
 * after every test (best-effort — failures here never fail the test).
 */

import { test as baseTest, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export { expect };

const COVERAGE_DIR = path.resolve(__dirname, "../../coverage/e2e/.nyc_output");

/**
 * Ensure the coverage output directory exists (idempotent).
 */
function ensureCoverageDir(): void {
  fs.mkdirSync(COVERAGE_DIR, { recursive: true });
}

/**
 * Read the Istanbul `__coverage__` global from the page and persist it
 * to disk under a unique filename. No-op when COVERAGE is not set.
 */
async function dumpPageCoverage(page: import("@playwright/test").Page) {
  if (!process.env.COVERAGE) return;
  try {
    const coverage = await page.evaluate(() => {
      return (window as unknown as { __coverage__?: unknown }).__coverage__;
    });
    if (!coverage) return;
    ensureCoverageDir();
    const id = crypto.randomUUID();
    const filePath = path.join(COVERAGE_DIR, `coverage-${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(coverage));
  } catch (err) {
    // Coverage collection is best-effort; never fail a test on it.
    // eslint-disable-next-line no-console
    console.warn("[e2e/coverage] failed to collect coverage data:", err);
  }
}

/**
 * Extended test with automatic coverage collection on every page after each
 * test. Tests should `import { test, expect } from "./fixtures"`.
 */
export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await use(page);
    await dumpPageCoverage(page);
  },
});
