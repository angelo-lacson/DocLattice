import type { Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join, resolve } from "path";

/**
 * Directory where auto-generated documentation screenshots are saved.
 * These PNGs are committed to the repo and referenced from markdown docs.
 */
const SCREENSHOTS_DIR = resolve(
  __dirname,
  "../../../docs/assets/images/screenshots/auto",
);

// Ensure output directory exists on module load.
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Capture a documentation screenshot during a Playwright component test.
 *
 * ## Naming Convention
 *
 * Use `--` (double-dash) to separate hierarchical segments:
 *
 *   {area}--{component}--{state}.png
 *
 * - **area**: feature area (e.g. "landing", "badges", "corpus", "versioning")
 * - **component**: specific component or view (e.g. "hero-section", "celebration-modal")
 * - **state**: visual state captured (e.g. "anonymous", "with-data", "empty")
 *
 * Use single hyphens within segments for multi-word names.
 * At least two segments are required; three are recommended.
 *
 * ## Examples
 *
 * ```ts
 * await docScreenshot(page, "landing--hero-section--anonymous");
 * await docScreenshot(page, "badges--celebration-modal--auto-award");
 * await docScreenshot(page, "corpus--list-view--with-items");
 * ```
 *
 * ## Referencing in Markdown
 *
 * ```md
 * ![Hero Section](../assets/images/screenshots/auto/landing--hero-section--anonymous.png)
 * ```
 *
 * Screenshots are automatically updated on every PR via CI.
 */
export async function docScreenshot(
  page: Page,
  name: string,
  options?: {
    /** Clip a specific region of the page. */
    clip?: { x: number; y: number; width: number; height: number };
    /** Capture the full scrollable page instead of the viewport. */
    fullPage?: boolean;
  },
): Promise<void> {
  const segments = name.split("--");
  if (segments.length < 2) {
    throw new Error(
      `docScreenshot name "${name}" must use convention: ` +
        `{area}--{component}--{state} (at least 2 segments separated by --). ` +
        `Got ${segments.length} segment(s).`,
    );
  }

  // Validate each segment is non-empty and uses only lowercase + hyphens + digits.
  for (const seg of segments) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(seg)) {
      throw new Error(
        `docScreenshot segment "${seg}" in "${name}" is invalid. ` +
          `Segments must be lowercase alphanumeric with single-hyphen separators ` +
          `(e.g. "hero-section", "with-data").`,
      );
    }
  }

  const filePath = join(SCREENSHOTS_DIR, `${name}.png`);

  await page.screenshot({
    path: filePath,
    fullPage: options?.fullPage ?? false,
    ...(options?.clip ? { clip: options.clip } : {}),
  });
}
