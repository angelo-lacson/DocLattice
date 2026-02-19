import { useState, useEffect } from "react";

/**
 * Fetches the markdown description content from a corpus's mdDescription URL.
 *
 * The GraphQL `mdDescription` field resolves to a file URL.  This hook
 * fetches that URL and returns the raw markdown text so components can
 * render it with `<SafeMarkdown>` or extract a plain-text excerpt.
 *
 * @param mdDescriptionUrl - The URL returned by the `mdDescription` GraphQL field.
 * @returns `{ content, loading }` – the fetched markdown string (or null) and a loading flag.
 */
export function useCorpusMdDescription(
  mdDescriptionUrl: string | null | undefined
): { content: string | null; loading: boolean } {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mdDescriptionUrl) {
      setContent(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(mdDescriptionUrl)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error fetching corpus md description:", err);
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mdDescriptionUrl]);

  return { content, loading };
}
