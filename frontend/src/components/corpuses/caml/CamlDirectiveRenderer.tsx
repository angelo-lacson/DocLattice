/**
 * CamlDirectiveRenderer — Generic renderer that resolves inline directives
 * in a CAML document by dispatching to registered handlers.
 *
 * This component wraps `CamlArticle` and:
 * 1. Extracts `{{@agent scope}}` directives from prose blocks
 * 2. Strips directive syntax from rendered content
 * 3. Looks up handlers from the directive registry
 * 4. Renders handler output (citation chips, review flags, etc.) after
 *    each prose block that contains directives
 *
 * The component is agent-agnostic — it doesn't know about @cite, @review,
 * or any specific directive. All behavior comes from registered handlers.
 */
import React, { useMemo } from "react";
import type { CamlDocument } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";

import { MarkdownMessageRenderer } from "../../threads/MarkdownMessageRenderer";
import {
  extractInlineDirectives,
  CamlInlineDirective,
} from "./inlineDirectives";
import {
  getDirectiveHandler,
  DirectiveHandlerContext,
} from "./directiveRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CamlDirectiveRendererProps {
  /** The parsed CAML document (from `parseCaml()`) */
  document: CamlDocument;
  /** Context passed to all directive handlers */
  handlerContext: DirectiveHandlerContext;
  /** Optional stats to pass through to CamlArticle */
  stats?: {
    annotations?: number;
    documents?: number;
    contributors?: number;
    threads?: number;
  };
}

// ---------------------------------------------------------------------------
// Inner component that renders a single directive via its registered handler.
// Only mounted when a handler exists (filtering happens in the parent), so
// the hook call is unconditional and React hook ordering is stable.
// ---------------------------------------------------------------------------

const DirectiveSlot: React.FC<{
  directive: CamlInlineDirective;
  context: DirectiveHandlerContext;
}> = ({ directive, context }) => {
  const handler = getDirectiveHandler(directive.agent)!;
  const result = handler(directive, context);
  return <>{result.node}</>;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CamlDirectiveRenderer: React.FC<CamlDirectiveRendererProps> = ({
  document,
  handlerContext,
  stats,
}) => {
  // Single pass: extract directives and build cleaned document simultaneously.
  // Each prose block is parsed once via extractInlineDirectives, producing both
  // the stripped content and the directive list keyed by position.
  const { cleanedDocument, positionToDirectives } = useMemo(() => {
    const directiveMap = new Map<string, CamlInlineDirective[]>();

    const cleaned: CamlDocument = {
      ...document,
      chapters: document.chapters.map((chapter, ci) => ({
        ...chapter,
        blocks: chapter.blocks.map((block, bi) => {
          if (block.type !== "prose") return block;
          const { content, directives } = extractInlineDirectives(
            block.content
          );
          if (directives.length > 0) {
            directiveMap.set(`${ci}-${bi}`, directives);
          }
          return { ...block, content };
        }),
      })),
    };

    return { cleanedDocument: cleaned, positionToDirectives: directiveMap };
  }, [document]);

  // Build a reverse lookup: cleaned content string -> position key.
  // This is needed because renderMarkdown receives the cleaned text and
  // we need to find the matching directives by position.
  const contentToPositionKey = useMemo(() => {
    const map = new Map<string, string>();
    cleanedDocument.chapters.forEach((chapter, ci) => {
      chapter.blocks.forEach((block, bi) => {
        if (block.type !== "prose") return;
        const key = `${ci}-${bi}`;
        if (positionToDirectives.has(key)) {
          map.set(block.content.trim(), key);
        }
      });
    });
    return map;
  }, [cleanedDocument, positionToDirectives]);

  const renderMarkdown = useMemo(() => {
    return (md: string) => {
      const posKey = contentToPositionKey.get(md.trim());
      const directives = posKey ? positionToDirectives.get(posKey) : undefined;

      return (
        <>
          <MarkdownMessageRenderer content={md} />
          {directives
            ?.filter((d) => getDirectiveHandler(d.agent))
            .map((d, i) => (
              <DirectiveSlot
                key={`${d.agent}-${d.scope}-${i}`}
                directive={d}
                context={handlerContext}
              />
            ))}
        </>
      );
    };
  }, [contentToPositionKey, positionToDirectives, handlerContext]);

  return (
    <CamlThemeProvider>
      <CamlArticle
        document={cleanedDocument}
        stats={stats}
        renderMarkdown={renderMarkdown}
      />
    </CamlThemeProvider>
  );
};
