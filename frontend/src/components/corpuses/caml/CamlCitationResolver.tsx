/**
 * CamlCitationResolver — Resolves `{{@cite}}` directives in a CAML document
 * by querying the corpus's vector embeddings via the existing semanticSearch
 * GraphQL query.
 *
 * This component wraps `CamlArticle` and provides the `renderDirective`
 * render slot that the upstream `@os-legal/caml-react` renderer calls for
 * each directive found in prose blocks.
 *
 * Until `@os-legal/caml` ships directive extraction natively, this component
 * does a client-side extraction pass on the parsed document.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLazyQuery } from "@apollo/client";
import type { CamlDocument } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";

import {
  SEMANTIC_SEARCH_ANNOTATIONS,
  SemanticSearchInput,
  SemanticSearchOutput,
} from "../../../graphql/queries";
import { MarkdownMessageRenderer } from "../../threads/MarkdownMessageRenderer";
import {
  extractInlineDirectives,
  CamlInlineDirective,
} from "./inlineDirectives";
import {
  CamlCitationChip,
  CamlCitationLoading,
  ResolvedCitation,
} from "./CamlCitationChip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DirectiveKey {
  /** Unique key for deduplication: `chapterIdx-blockIdx-directiveIdx` */
  key: string;
  directive: CamlInlineDirective;
}

interface CamlCitationResolverProps {
  /** The parsed CAML document (from `parseCaml()`) */
  document: CamlDocument;
  /** Corpus ID (GraphQL global ID) for scoping semantic search */
  corpusId: string;
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

const CITE_RESULTS_LIMIT = 3;

/**
 * Walk the parsed CamlDocument and extract all inline directives from
 * prose blocks. Returns a flat list of directives with unique keys.
 *
 * NOTE: This is a stopgap until `@os-legal/caml` extracts directives
 * natively in the parser. Once the upstream package ships
 * `CamlProse.directives`, this function becomes unnecessary.
 */
function collectDirectives(doc: CamlDocument): DirectiveKey[] {
  const result: DirectiveKey[] = [];

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
 * Build a modified CamlDocument where prose blocks have directives
 * stripped from their content (so markdown renderers don't show raw
 * `{{@cite sentence}}` text).
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
// Component
// ---------------------------------------------------------------------------

export const CamlCitationResolver: React.FC<CamlCitationResolverProps> = ({
  document,
  corpusId,
  stats,
}) => {
  const [resolvedCitations, setResolvedCitations] = useState<
    Map<string, ResolvedCitation[]>
  >(new Map());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const [searchAnnotations] = useLazyQuery<
    SemanticSearchOutput,
    SemanticSearchInput
  >(SEMANTIC_SEARCH_ANNOTATIONS);

  // Extract all directives from the document
  const directiveKeys = useMemo(() => collectDirectives(document), [document]);

  // Build the cleaned document (directives stripped from prose)
  const cleanedDocument = useMemo(
    () => stripDirectivesFromDocument(document),
    [document]
  );

  // Resolve each @cite directive via semantic search
  useEffect(() => {
    for (const { key, directive } of directiveKeys) {
      // Only resolve @cite directives
      if (directive.agent !== "cite") continue;
      // Skip already resolved or in-flight
      if (resolvedCitations.has(key) || pendingKeys.has(key)) continue;

      setPendingKeys((prev) => new Set(prev).add(key));

      const mode = directive.args.mode ?? "best";
      const limit =
        mode === "all"
          ? parseInt(directive.args.limit ?? "5", 10)
          : parseInt(directive.args.limit ?? "1", 10);

      searchAnnotations({
        variables: {
          query: directive.context,
          corpusId,
          limit: Math.min(limit, CITE_RESULTS_LIMIT),
        },
      }).then(({ data }) => {
        const citations: ResolvedCitation[] = (data?.semanticSearch ?? []).map(
          (r) => ({
            annotationId: r.annotation.id,
            rawText: r.annotation.rawText ?? "",
            labelText: r.annotation.annotationLabel?.text ?? "",
            labelColor: r.annotation.annotationLabel?.color ?? "#6b7280",
            documentTitle:
              r.document?.title ?? r.annotation.document?.title ?? "Unknown",
            documentSlug: r.document?.slug ?? r.annotation.document?.slug ?? "",
            corpusSlug: r.annotation.corpus?.slug ?? "",
            similarityScore: r.similarityScore,
            page: r.annotation.page,
          })
        );

        setResolvedCitations((prev) => new Map(prev).set(key, citations));
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
    }
  }, [
    directiveKeys,
    corpusId,
    searchAnnotations,
    resolvedCitations,
    pendingKeys,
  ]);

  // Build a renderMarkdown wrapper that appends citation chips after
  // each prose block's markdown content.
  //
  // FUTURE: Once @os-legal/caml-react supports a `renderDirective` slot,
  // this becomes much cleaner — the renderer calls the slot at the exact
  // position in the prose where the directive appeared, and we just return
  // chips. For now, we append all resolved citations after the block.
  const renderMarkdownWithCitations = useMemo(() => {
    // Build a map from cleaned prose content → directive keys
    // This lets us match rendered blocks to their directives.
    const contentToKeys = new Map<string, string[]>();

    document.chapters.forEach((chapter, ci) => {
      chapter.blocks.forEach((block, bi) => {
        if (block.type !== "prose") return;
        const { content, directives } = extractInlineDirectives(block.content);
        if (directives.length === 0) return;
        const keys = directives.map((_, di) => `${ci}-${bi}-${di}`);
        contentToKeys.set(content, keys);
      });
    });

    return (md: string) => {
      const keys = contentToKeys.get(md.trim());
      const hasCitations = keys && keys.length > 0;

      return (
        <>
          <MarkdownMessageRenderer content={md} />
          {hasCitations &&
            keys.map((key) => {
              const citations = resolvedCitations.get(key);
              if (!citations) {
                return pendingKeys.has(key) ? (
                  <CamlCitationLoading key={key} />
                ) : null;
              }
              return citations.map((c) => (
                <CamlCitationChip
                  key={`${key}-${c.annotationId}`}
                  citation={c}
                />
              ));
            })}
        </>
      );
    };
  }, [document, resolvedCitations, pendingKeys]);

  return (
    <CamlThemeProvider>
      <CamlArticle
        document={cleanedDocument}
        stats={stats}
        renderMarkdown={renderMarkdownWithCitations}
      />
    </CamlThemeProvider>
  );
};
