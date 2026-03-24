/**
 * CamlArticle — Top-level renderer for a parsed CAML document.
 *
 * Takes a CamlDocument (JSON IR from the parser) and renders the full
 * scrollytelling article: hero, chapters with blocks, and footer.
 */
import React from "react";

import type { CamlDocument } from "../parser/types";
import { CamlHeroRenderer } from "./CamlHero";
import { CamlChapterRenderer } from "./CamlChapter";
import { CamlFooterRenderer } from "./CamlFooter";
import { ArticleContainer } from "./styles";

export interface CamlArticleProps {
  document: CamlDocument;
  /** Corpus stats for live data blocks (optional) */
  stats?: {
    annotations?: number;
    documents?: number;
    contributors?: number;
    threads?: number;
  };
}

export const CamlArticle: React.FC<CamlArticleProps> = ({
  document: doc,
  stats,
}) => {
  return (
    <ArticleContainer>
      {doc.frontmatter.hero && <CamlHeroRenderer hero={doc.frontmatter.hero} />}

      {doc.chapters.map((chapter) => (
        <CamlChapterRenderer key={chapter.id} chapter={chapter} stats={stats} />
      ))}

      {doc.frontmatter.footer && (
        <CamlFooterRenderer footer={doc.frontmatter.footer} />
      )}
    </ArticleContainer>
  );
};
