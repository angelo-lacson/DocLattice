import { useState, useEffect } from "react";

/**
 * Module-level cache that deduplicates concurrent fetches to the same URL.
 * Entries are removed once the promise settles so stale data does not
 * accumulate across navigation cycles.
 */
const inflightRequests = new Map<string, Promise<string | null>>();

function fetchMdDescription(url: string): Promise<string | null> {
  const existing = inflightRequests.get(url);
  if (existing) return existing;

  const promise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.text();
    })
    .catch((err) => {
      console.error("Error fetching corpus md description:", err);
      return null;
    })
    .finally(() => {
      inflightRequests.delete(url);
    });

  inflightRequests.set(url, promise);
  return promise;
}

/**
 * Fetches the markdown description content from a corpus's mdDescription URL.
 *
 * The GraphQL `mdDescription` field resolves to a file URL.  This hook
 * fetches that URL and returns the raw markdown text so components can
 * render it with `<SafeMarkdown>` or extract a plain-text excerpt.
 *
 * Concurrent mounts with the same URL share a single in-flight request.
 *
 * @param mdDescriptionUrl - The URL returned by the `mdDescription` GraphQL field.
 * @returns The fetched markdown string, or null while loading / on error.
 */
export function useCorpusMdDescription(
  mdDescriptionUrl: string | null | undefined
): string | null {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (!mdDescriptionUrl) {
      setContent(null);
      return;
    }

    let cancelled = false;

    fetchMdDescription(mdDescriptionUrl).then((text) => {
      if (!cancelled) {
        setContent(text);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mdDescriptionUrl]);

  return content;
}

/** @internal Exposed for testing only. */
export { inflightRequests as _inflightRequests };
