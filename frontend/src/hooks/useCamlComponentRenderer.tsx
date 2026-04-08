/**
 * useCamlComponentRenderer — Hook that creates a `renderMarkdown` callback
 * for CamlArticle which intercepts `[component:TYPE ...]` markers and
 * renders registered React components in their place.
 *
 * Usage:
 *   const registry = { "extract-grid": ExtractGridEmbed };
 *   const renderMarkdown = useCamlComponentRenderer(registry);
 *   <CamlArticle document={doc} renderMarkdown={renderMarkdown} />
 */
import React, { useCallback } from "react";
import { MarkdownMessageRenderer } from "../components/threads/MarkdownMessageRenderer";
import { ErrorBoundary } from "../components/widgets/ErrorBoundary";
import { resolveComponentMarker } from "../utils/camlComponents";
export type { CamlComponentRegistry } from "../utils/camlComponents";

/**
 * Returns a stable `renderMarkdown` callback that checks each prose block
 * for a `[component:TYPE ...]` marker. If it matches a registered component,
 * renders that component with the parsed props; otherwise falls back to the
 * standard markdown renderer.
 */
export function useCamlComponentRenderer(
  registry: Record<
    string,
    React.ComponentType<Record<string, string | undefined>>
  >
): (md: string) => React.ReactNode {
  return useCallback(
    (md: string) => {
      const resolved = resolveComponentMarker(md, registry);
      if (resolved) {
        return (
          <ErrorBoundary
            fallback={(error) => (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  margin: "0.5rem 0",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  color: "#6b7280",
                  fontSize: "0.8125rem",
                }}
              >
                Embedded component failed to render
                {process.env.NODE_ENV === "development" && (
                  <>: {error.message}</>
                )}
              </div>
            )}
          >
            {resolved}
          </ErrorBoundary>
        );
      }
      return <MarkdownMessageRenderer content={md} />;
    },
    [registry]
  );
}
