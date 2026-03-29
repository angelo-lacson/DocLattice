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
import {
  parseComponentMarker,
  CamlEmbedComponent,
} from "../utils/camlComponents";

/** Map of component type names to their React components. */
export type CamlComponentRegistry = Record<string, CamlEmbedComponent>;

/**
 * Returns a stable `renderMarkdown` callback that checks each prose block
 * for a `[component:TYPE ...]` marker. If it matches a registered component,
 * renders that component with the parsed props; otherwise falls back to the
 * standard markdown renderer.
 */
export function useCamlComponentRenderer(
  registry: CamlComponentRegistry
): (md: string) => React.ReactNode {
  return useCallback(
    (md: string) => {
      const parsed = parseComponentMarker(md);
      if (parsed) {
        const Component = registry[parsed.type];
        if (Component) {
          return <Component {...parsed.props} />;
        }
      }
      return <MarkdownMessageRenderer content={md} />;
    },
    [registry]
  );
}
