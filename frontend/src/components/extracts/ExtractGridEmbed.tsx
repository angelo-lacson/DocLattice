/**
 * ExtractGridEmbed — Read-only extract grid table for embedding in CAML articles.
 *
 * Renders a compact, styled table: rows = documents, columns = fieldset columns,
 * cells = datacell values with links to source annotations in the document viewer.
 *
 * Usage in CAML prose blocks via the marker syntax:
 *   [extract-grid:EXTRACT_RELAY_ID]
 *
 * Detected by the custom renderMarkdown function in CorpusArticleView and replaced
 * with this component. Will migrate to a proper `customBlocks` prop once upstream
 * @os-legal/caml-react supports it (see issue #1172).
 */
import React, { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { ExternalLink, AlertCircle, Loader2, Table2 } from "lucide-react";
import styled, { keyframes } from "styled-components";

import { DATACELL_STATUS_COLORS } from "../../assets/configurations/constants";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";
import {
  GET_EXTRACT_GRID_EMBED,
  GetExtractGridEmbedInput,
  GetExtractGridEmbedOutput,
  ExtractGridEmbedCell,
  ExtractGridEmbedColumn,
} from "../../graphql/queries";
import { getDocumentUrl, buildQueryParams } from "../../utils/navigationUtils";

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const SpinningLoader = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;

const EmbedWrapper = styled.div`
  margin: 1.5rem 0;
  border-radius: 12px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  overflow: hidden;
  background: ${OS_LEGAL_COLORS.surface};
`;

const EmbedHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const TableScrollContainer = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  line-height: 1.5;
`;

const Th = styled.th`
  text-align: left;
  padding: 0.625rem 0.75rem;
  background: ${OS_LEGAL_COLORS.surfaceLight};
  border-bottom: 2px solid ${OS_LEGAL_COLORS.border};
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
`;

const Td = styled.td`
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  color: ${OS_LEGAL_COLORS.textPrimary};
  vertical-align: top;
  max-width: 300px;
`;

const Tr = styled.tr`
  &:last-child td {
    border-bottom: none;
  }
  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceLight};
  }
`;

const DocLink = styled.a`
  color: ${OS_LEGAL_COLORS.accent};
  text-decoration: none;
  font-weight: 500;
  &:hover {
    text-decoration: underline;
  }
`;

const SourceChip = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.375rem;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  background: ${OS_LEGAL_COLORS.accentLight};
  color: ${OS_LEGAL_COLORS.accent};
  font-size: 0.6875rem;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  vertical-align: middle;

  &:hover {
    background: ${OS_LEGAL_COLORS.accentMedium};
    text-decoration: none;
  }
`;

const CellContent = styled.span`
  word-break: break-word;
`;

const StatusDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${(p) => p.$color};
  margin-right: 0.375rem;
  vertical-align: middle;
`;

const CenterMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 0.5rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 0.8125rem;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a datacell value for display. */
function formatCellValue(data: any): string {
  if (data === null || data === undefined) return "\u2014";
  if (typeof data === "boolean") return data ? "Yes" : "No";
  if (typeof data === "object") return JSON.stringify(data);
  return String(data);
}

/** Build a link to the document viewer at a specific source annotation. */
function buildSourceLink(
  cell: ExtractGridEmbedCell,
  sourceId: string,
  corpus: { slug: string; creator: { slug: string } }
): string {
  const docUrl = getDocumentUrl(
    {
      id: cell.document.id,
      slug: cell.document.slug,
      creator: { id: "", slug: cell.document.creator.slug },
    },
    {
      id: "",
      slug: corpus.slug,
      creator: { id: "", slug: corpus.creator.slug },
    }
  );
  const query = buildQueryParams({ annotationIds: [sourceId] });
  return docUrl + query;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GridRow {
  document: ExtractGridEmbedCell["document"];
  cells: Map<string, ExtractGridEmbedCell>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ExtractGridEmbedProps {
  /** Relay global ID of the extract to embed. */
  extractId?: string;
  /** All other props from the generic component marker are accepted. */
  [key: string]: string | undefined;
}

export const ExtractGridEmbed: React.FC<ExtractGridEmbedProps> = ({
  extractId,
}) => {
  const { data, loading, error } = useQuery<
    GetExtractGridEmbedOutput,
    GetExtractGridEmbedInput
  >(GET_EXTRACT_GRID_EMBED, {
    variables: { extractId: extractId ?? "" },
    skip: !extractId,
    fetchPolicy: "cache-first",
  });

  const extract = data?.extract;

  // Build row-major grid: group datacells by document
  // NOTE: This hook must remain above all early returns (Rules of Hooks).
  const { columns, rows } = useMemo(() => {
    if (!extract)
      return { columns: [] as ExtractGridEmbedColumn[], rows: [] as GridRow[] };

    const cols = extract.fieldset.fullColumnList;
    const rowMap = new Map<string, GridRow>();

    for (const cell of extract.fullDatacellList) {
      const docId = cell.document.id;
      if (!rowMap.has(docId)) {
        rowMap.set(docId, { document: cell.document, cells: new Map() });
      }
      rowMap.get(docId)!.cells.set(cell.column.id, cell);
    }

    return { columns: cols, rows: Array.from(rowMap.values()) };
  }, [extract]);

  if (!extractId) {
    return (
      <EmbedWrapper>
        <CenterMessage>
          <AlertCircle size={20} color={OS_LEGAL_COLORS.textMuted} />
          Missing extractId prop.
        </CenterMessage>
      </EmbedWrapper>
    );
  }

  // --- Loading state ---
  if (loading) {
    return (
      <EmbedWrapper>
        <CenterMessage>
          <SpinningLoader size={20} />
          Loading extract data...
        </CenterMessage>
      </EmbedWrapper>
    );
  }

  // --- Error state ---
  if (error || !extract) {
    return (
      <EmbedWrapper>
        <CenterMessage>
          <AlertCircle size={20} color={OS_LEGAL_COLORS.textMuted} />
          {error
            ? "Failed to load extract data."
            : "Extract not found or not accessible."}
        </CenterMessage>
      </EmbedWrapper>
    );
  }

  // --- Empty state ---
  if (rows.length === 0) {
    return (
      <EmbedWrapper>
        <EmbedHeader>
          <Table2 size={14} />
          {extract.name}
        </EmbedHeader>
        <CenterMessage>No data extracted yet.</CenterMessage>
      </EmbedWrapper>
    );
  }

  // --- Table ---
  return (
    <EmbedWrapper>
      <EmbedHeader>
        <Table2 size={14} />
        {extract.name}
      </EmbedHeader>
      <TableScrollContainer>
        <StyledTable>
          <thead>
            <tr>
              <Th>Document</Th>
              {columns.map((col) => (
                <Th key={col.id}>{col.name}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.document.id}>
                <Td>
                  <DocLink
                    href={getDocumentUrl(
                      {
                        id: row.document.id,
                        slug: row.document.slug,
                        creator: {
                          id: "",
                          slug: row.document.creator.slug,
                        },
                      },
                      {
                        id: "",
                        slug: extract.corpus.slug,
                        creator: {
                          id: "",
                          slug: extract.corpus.creator.slug,
                        },
                      }
                    )}
                  >
                    {row.document.title}
                  </DocLink>
                </Td>
                {columns.map((col) => {
                  const cell = row.cells.get(col.id);
                  if (!cell) {
                    return <Td key={col.id}>{"\u2014"}</Td>;
                  }

                  const value = cell.correctedData ?? cell.data;
                  const displayValue = formatCellValue(value);
                  const sources = cell.fullSourceList ?? [];
                  const isComplete = !!cell.completed;
                  const isFailed = !!cell.failed;

                  return (
                    <Td key={col.id}>
                      {isFailed && (
                        <StatusDot $color={DATACELL_STATUS_COLORS.FAILED} />
                      )}
                      {isComplete && !isFailed && (
                        <StatusDot $color={DATACELL_STATUS_COLORS.COMPLETE} />
                      )}
                      {!isComplete && !isFailed && (
                        <StatusDot $color={DATACELL_STATUS_COLORS.PENDING} />
                      )}
                      <CellContent>{displayValue}</CellContent>
                      {sources.length > 0 && (
                        <SourceChip
                          href={buildSourceLink(
                            cell,
                            sources[0].id,
                            extract.corpus
                          )}
                          title={`View source (p.${sources[0].page + 1})`}
                        >
                          <ExternalLink size={10} />
                          p.{sources[0].page + 1}
                        </SourceChip>
                      )}
                    </Td>
                  );
                })}
              </Tr>
            ))}
          </tbody>
        </StyledTable>
      </TableScrollContainer>
    </EmbedWrapper>
  );
};
