/**
 * CamlBlocks — Renders individual CAML block types.
 *
 * Each block type has its own component. The CamlBlockRenderer dispatches
 * to the correct one based on block.type.
 */
import React, { useState } from "react";

import type {
  CamlBlock,
  CamlCards,
  CamlPills,
  CamlTabs,
  CamlTimeline,
  CamlCta,
  CamlSignup,
  CamlCorpusStats,
  CamlProse,
} from "../parser/types";
import { MarkdownMessageRenderer } from "../../components/threads/MarkdownMessageRenderer";
import {
  ProseContainer,
  Pullquote,
  CardsGrid,
  CardItem,
  CardHeader,
  CardLabel,
  CardMeta,
  CardBody,
  CardFooter,
  PillsRow,
  PillCard,
  PillBigText,
  PillInfo,
  PillLabel,
  PillDetail,
  PillStatus,
  TabsContainer,
  TabBar,
  TabButton,
  TabStatus,
  TabPanel,
  TabSectionHeading,
  TabSectionContent,
  TabSources,
  TabSourceChip,
  TimelineContainer,
  TimelineLegend,
  TimelineLegendItem,
  TimelineEntry,
  TimelineDot,
  TimelineDate,
  TimelineLabel,
  CtaRow,
  CtaButton,
  SignupBox,
  SignupTitle,
  SignupBody,
  SignupButton,
  StatsGrid,
  StatCard,
  StatValue,
  StatLabel,
} from "./styles";

interface BlockRendererProps {
  block: CamlBlock;
  dark?: boolean;
  stats?: {
    annotations?: number;
    documents?: number;
    contributors?: number;
    threads?: number;
  };
}

export const CamlBlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  dark,
  stats,
}) => {
  switch (block.type) {
    case "prose":
      return <ProseBlock block={block} dark={dark} />;
    case "cards":
      return <CardsBlock block={block} />;
    case "pills":
      return <PillsBlock block={block} />;
    case "tabs":
      return <TabsBlock block={block} />;
    case "timeline":
      return <TimelineBlock block={block} />;
    case "cta":
      return <CtaBlock block={block} />;
    case "signup":
      return <SignupBlock block={block} />;
    case "corpus-stats":
      return <CorpusStatsBlock block={block} stats={stats} />;
    case "annotation-embed":
      // v2 feature — render placeholder
      return (
        <ProseContainer>
          <em>Annotation embed (coming soon)</em>
        </ProseContainer>
      );
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

function ProseBlock({ block, dark }: { block: CamlProse; dark?: boolean }) {
  // Split content into pullquotes (>>>) and regular prose
  const segments = splitPullquotes(block.content);

  return (
    <ProseContainer $dark={dark}>
      {segments.map((seg, i) => {
        if (seg.type === "pullquote") {
          return <Pullquote key={i}>{seg.text}</Pullquote>;
        }
        return <MarkdownMessageRenderer key={i} content={seg.text} />;
      })}
    </ProseContainer>
  );
}

interface TextSegment {
  type: "prose" | "pullquote";
  text: string;
}

function splitPullquotes(content: string): TextSegment[] {
  const lines = content.split("\n");
  const segments: TextSegment[] = [];
  let currentProse: string[] = [];
  let currentPullquote: string[] = [];

  const flushProse = () => {
    const text = currentProse.join("\n").trim();
    if (text) segments.push({ type: "prose", text });
    currentProse = [];
  };

  const flushPullquote = () => {
    const text = currentPullquote.join(" ").trim();
    if (text) segments.push({ type: "pullquote", text });
    currentPullquote = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(">>>")) {
      if (currentProse.length > 0) flushProse();
      // Strip >>> prefix and quotes
      const pqText = trimmed.slice(3).trim().replace(/^"|"$/g, "");
      currentPullquote.push(pqText);
    } else {
      if (currentPullquote.length > 0) flushPullquote();
      currentProse.push(line);
    }
  }

  if (currentPullquote.length > 0) flushPullquote();
  if (currentProse.length > 0) flushProse();

  return segments;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function CardsBlock({ block }: { block: CamlCards }) {
  return (
    <CardsGrid $columns={block.columns}>
      {block.items.map((item, i) => (
        <CardItem key={i} $accent={item.accent}>
          <CardHeader>
            <CardLabel>{item.label}</CardLabel>
            {item.meta && <CardMeta>{item.meta}</CardMeta>}
          </CardHeader>
          {item.body && <CardBody>{item.body}</CardBody>}
          {item.footer && <CardFooter>{item.footer}</CardFooter>}
        </CardItem>
      ))}
    </CardsGrid>
  );
}

// ---------------------------------------------------------------------------
// Pills
// ---------------------------------------------------------------------------

function PillsBlock({ block }: { block: CamlPills }) {
  return (
    <PillsRow>
      {block.items.map((item, i) => (
        <PillCard key={i}>
          <PillBigText>{item.bigText}</PillBigText>
          <PillInfo>
            <PillLabel>{item.label}</PillLabel>
            {item.detail && <PillDetail>{item.detail}</PillDetail>}
            {item.status && (
              <PillStatus $color={item.statusColor}>{item.status}</PillStatus>
            )}
          </PillInfo>
        </PillCard>
      ))}
    </PillsRow>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function TabsBlock({ block }: { block: CamlTabs }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeTab = block.tabs[activeIndex];

  if (!activeTab) return null;

  return (
    <TabsContainer>
      <TabBar>
        {block.tabs.map((tab, i) => (
          <TabButton
            key={i}
            $active={i === activeIndex}
            $color={tab.color}
            onClick={() => setActiveIndex(i)}
          >
            {tab.label}
            {tab.status && (
              <TabStatus $color={tab.color}>{tab.status}</TabStatus>
            )}
          </TabButton>
        ))}
      </TabBar>

      <TabPanel>
        {activeTab.sections.map((section, i) => (
          <React.Fragment key={i}>
            {section.heading && (
              <TabSectionHeading
                $highlight={section.highlight}
                $color={activeTab.color}
              >
                {section.heading}
              </TabSectionHeading>
            )}
            <TabSectionContent>
              <MarkdownMessageRenderer content={section.content} />
            </TabSectionContent>
          </React.Fragment>
        ))}

        {activeTab.sources.length > 0 && (
          <TabSources>
            {activeTab.sources.map((source, i) => (
              <TabSourceChip key={i}>{source.name}</TabSourceChip>
            ))}
          </TabSources>
        )}
      </TabPanel>
    </TabsContainer>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

function TimelineBlock({ block }: { block: CamlTimeline }) {
  const colorMap = new Map(
    block.legend.map((l) => [l.label.toLowerCase(), l.color])
  );

  return (
    <>
      {block.legend.length > 0 && (
        <TimelineLegend>
          {block.legend.map((item, i) => (
            <TimelineLegendItem key={i} $color={item.color}>
              {item.label}
            </TimelineLegendItem>
          ))}
        </TimelineLegend>
      )}

      <TimelineContainer>
        {block.items.map((item, i) => (
          <TimelineEntry key={i}>
            <TimelineDot $color={colorMap.get(item.side) || "#94a3b8"} />
            <TimelineDate>{item.date}</TimelineDate>
            <TimelineLabel>{item.label}</TimelineLabel>
          </TimelineEntry>
        ))}
      </TimelineContainer>
    </>
  );
}

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

function CtaBlock({ block }: { block: CamlCta }) {
  return (
    <CtaRow>
      {block.items.map((item, i) => (
        <CtaButton
          key={i}
          href={item.href}
          $primary={item.primary}
          target={item.href.startsWith("http") ? "_blank" : undefined}
          rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          {item.label}
        </CtaButton>
      ))}
    </CtaRow>
  );
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

function SignupBlock({ block }: { block: CamlSignup }) {
  return (
    <SignupBox>
      {block.title && <SignupTitle>{block.title}</SignupTitle>}
      {block.body && <SignupBody>{block.body}</SignupBody>}
      {block.button && <SignupButton>{block.button}</SignupButton>}
    </SignupBox>
  );
}

// ---------------------------------------------------------------------------
// Corpus Stats
// ---------------------------------------------------------------------------

function CorpusStatsBlock({
  block,
  stats,
}: {
  block: CamlCorpusStats;
  stats?: Record<string, number | undefined>;
}) {
  return (
    <StatsGrid>
      {block.items.map((item, i) => (
        <StatCard key={i}>
          <StatValue>{stats?.[item.key] ?? "—"}</StatValue>
          <StatLabel>{item.label}</StatLabel>
        </StatCard>
      ))}
    </StatsGrid>
  );
}
