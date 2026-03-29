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

interface DirectiveLocation {
  /** Unique key: `chapterIdx-blockIdx-directiveIdx` */
  key: string;
  directive: CamlInlineDirective;
}

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk the parsed CamlDocument and extract all inline directives from
 * prose blocks, keyed by position.
 */
function collectDirectives(doc: CamlDocument): DirectiveLocation[] {
  const result: DirectiveLocation[] = [];

  doc.chapters.forEach((chapter, ci) => {
    chapter.blocks.forEach((block, bi) => {
      if (block.type !== "prose") return;

      const { directives } = extractInlineDirectives(block.content);
      directives.forEach((d, di) => {
        result.push({
          key: `${ci}-${bi}-${di}`,
          directive: d,
        });
      });
    });
  });

  return result;
}

/**
 * Build a modified CamlDocument where prose blocks have directive syntax
 * stripped from their content.
 */
function stripDirectivesFromDocument(doc: CamlDocument): CamlDocument {
  return {
    ...doc,
    chapters: doc.chapters.map((chapter) => ({
      ...chapter,
      blocks: chapter.blocks.map((block) => {
        if (block.type !== "prose") return block;
        const { content } = extractInlineDirectives(block.content);
        return { ...block, content };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Inner component that renders a single directive via its registered handler.
// Must be a component (not inline) so that handler hooks are called correctly.
// ---------------------------------------------------------------------------

const DirectiveSlot: React.FC<{
  directive: CamlInlineDirective;
  context: DirectiveHandlerContext;
}> = ({ directive, context }) => {
  const handler = getDirectiveHandler(directive.agent);
  if (!handler) return null;

  // The handler is a React hook — it can use useState, useQuery, etc.
  // eslint-disable-next-line react-hooks/rules-of-hooks
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
  const cleanedDocument = useMemo(
    () => stripDirectivesFromDocument(document),
    [document]
  );

  // Build a map: cleaned prose content → list of directives for that block.
  // This lets the renderMarkdown wrapper know which directives to render
  // after each prose block.
  const contentToDirectives = useMemo(() => {
    const map = new Map<string, CamlInlineDirective[]>();

    document.chapters.forEach((chapter) => {
      chapter.blocks.forEach((block) => {
        if (block.type !== "prose") return;
        const { content, directives } = extractInlineDirectives(block.content);
        if (directives.length > 0) {
          map.set(content, directives);
        }
      });
    });

    return map;
  }, [document]);

  const renderMarkdown = useMemo(() => {
    return (md: string) => {
      const directives = contentToDirectives.get(md.trim());

      return (
        <>
          <MarkdownMessageRenderer content={md} />
          {directives?.map((d, i) => (
            <DirectiveSlot
              key={`${d.agent}-${d.scope}-${i}`}
              directive={d}
              context={handlerContext}
            />
          ))}
        </>
      );
    };
  }, [contentToDirectives, handlerContext]);

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
