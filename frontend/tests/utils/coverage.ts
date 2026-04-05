import { test as baseTest, expect } from "@playwright/experimental-ct-react";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const COVERAGE_DIR = path.resolve(__dirname, "../../coverage/ct/.nyc_output");

/**
 * Extended Playwright CT test fixture that collects Istanbul coverage
 * from the browser after each test. Enable by setting COVERAGE=true.
 *
 * Usage in test files:
 *   import { test, expect } from "../utils/coverage";
 *   // ... use test/expect as usual
 */
export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await use(page);

    // Only collect coverage when COVERAGE env var is set
    if (!process.env.COVERAGE) return;

    // Extract Istanbul's __coverage__ object from the page
    const coverage = await page.evaluate(() => {
      return (window as unknown as { __coverage__?: unknown }).__coverage__;
    });

    if (coverage) {
      // Ensure output directory exists
      fs.mkdirSync(COVERAGE_DIR, { recursive: true });

      // Write coverage data with a unique filename
      const id = crypto.randomUUID();
      const filePath = path.join(COVERAGE_DIR, `coverage-${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(coverage));
    }
  },
});

export { expect };
