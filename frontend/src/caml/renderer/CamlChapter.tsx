import React from "react";

import type { CamlChapter, CamlBlock } from "../parser/types";
import { CamlBlockRenderer } from "./CamlBlocks";
import { ChapterSection, ChapterKicker, ChapterTitle } from "./styles";

export interface CamlChapterRendererProps {
  chapter: CamlChapter;
  stats?: {
    annotations?: number;
    documents?: number;
    contributors?: number;
    threads?: number;
  };
}

export const CamlChapterRenderer: React.FC<CamlChapterRendererProps> = ({
  chapter,
  stats,
}) => {
  const isDark = chapter.theme === "dark" || chapter.gradient;

  return (
    <ChapterSection
      id={chapter.id}
      $theme={chapter.theme}
      $gradient={chapter.gradient}
      $centered={chapter.centered}
    >
      {chapter.kicker && (
        <ChapterKicker $dark={isDark}>{chapter.kicker}</ChapterKicker>
      )}

      {chapter.title && (
        <ChapterTitle $dark={isDark}>{chapter.title}</ChapterTitle>
      )}

      {chapter.blocks.map((block: CamlBlock, index: number) => (
        <CamlBlockRenderer
          key={index}
          block={block}
          dark={isDark}
          stats={stats}
        />
      ))}
    </ChapterSection>
  );
};
