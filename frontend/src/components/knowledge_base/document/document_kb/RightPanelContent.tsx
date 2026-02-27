import React, { Dispatch, SetStateAction } from "react";
import { Database, BarChart3 } from "lucide-react";
import {
  AnalysisType,
  ColumnType,
  DatacellType,
  ExtractType,
  NoteType,
} from "../../../../types/graphql-api";

import {
  SidebarHeader,
  SidebarHeaderContent,
  SidebarHeaderTitle,
  SidebarHeaderSubtitle,
  CompactAnnotationFeed,
} from "./styles";

import {
  UnifiedContentFeed,
  SidebarControlBar,
  ContentFilters,
  SortOption,
  SidebarViewMode,
} from "../unified_feed";
import { ChatTray } from "../right_tray/ChatTray";
import { SafeMarkdown } from "../../markdown/SafeMarkdown";
import { SingleDocumentExtractResults } from "../../../annotator/sidebar/SingleDocumentExtractResults";
import { DocumentDiscussionsContent } from "../../../discussions/DocumentDiscussionsContent";

export interface RightPanelContentProps {
  /** Whether the right panel is currently shown */
  showRightPanel: boolean;
  /** Current sidebar view mode */
  sidebarViewMode: SidebarViewMode["mode"];
  /** Setter for sidebar view mode */
  setSidebarViewMode: (mode: SidebarViewMode["mode"]) => void;
  /** Feed content filters */
  feedFilters: ContentFilters;
  /** Setter for feed filters */
  setFeedFilters: (filters: ContentFilters) => void;
  /** Feed sort option */
  feedSortBy: SortOption;
  /** Setter for feed sort option */
  setFeedSortBy: (sort: SortOption) => void;
  /** Current search text */
  searchText: string;
  /** Currently selected analysis */
  selectedAnalysis: AnalysisType | null;
  /** Currently selected extract */
  selectedExtract: ExtractType | null;
  /** Data cells for extract results */
  dataCells: DatacellType[];
  /** Columns for extract results */
  columns: ColumnType[];
  /** Notes for the document */
  notes: NoteType[];
  /** Whether data is loading */
  loading: boolean;
  /** Whether the view is read-only */
  readOnly: boolean;
  /** Document ID */
  documentId: string;
  /** Optional corpus ID */
  corpusId?: string;
  /** Setter for active layer */
  setActiveLayer: (layer: "knowledge" | "document") => void;
  /** Setter for selected note */
  setSelectedNote: Dispatch<SetStateAction<NoteType | null>>;
  /** Whether to show load state in chat */
  showLoad: boolean;
  /** Setter for show load state */
  setShowLoad: Dispatch<SetStateAction<boolean>>;
  /** Pending chat message to send */
  pendingChatMessage?: string;
}

/**
 * Renders the content of the right sidebar panel based on the current view mode.
 * Handles: chat, feed, extract, analysis, and discussions views.
 */
export const RightPanelContent: React.FC<RightPanelContentProps> = ({
  showRightPanel,
  sidebarViewMode,
  setSidebarViewMode,
  feedFilters,
  setFeedFilters,
  feedSortBy,
  setFeedSortBy,
  searchText,
  selectedAnalysis,
  selectedExtract,
  dataCells,
  columns,
  notes,
  loading,
  readOnly,
  documentId,
  corpusId,
  setActiveLayer,
  setSelectedNote,
  showLoad,
  setShowLoad,
  pendingChatMessage,
}) => {
  if (!showRightPanel) return null;

  // Control bar for switching between chat and feed modes
  const controlBar = (
    <SidebarControlBar
      viewMode={sidebarViewMode}
      onViewModeChange={setSidebarViewMode}
      filters={feedFilters}
      onFiltersChange={setFeedFilters}
      sortBy={feedSortBy}
      onSortChange={setFeedSortBy}
      hasActiveSearch={!!searchText}
    />
  );

  // Handle extract mode - show extract results
  if (sidebarViewMode === "extract" && selectedExtract) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid #e2e8f0",
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <Database size={20} style={{ color: "#8b5cf6" }} />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "1rem",
                color: "#1e293b",
              }}
            >
              {selectedExtract.name}
            </div>
            <div
              style={{
                fontSize: "0.875rem",
                color: "#64748b",
              }}
            >
              Data Extract Results
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <SingleDocumentExtractResults
            datacells={dataCells}
            columns={columns}
          />
        </div>
      </div>
    );
  }

  // Handle analysis mode - show analysis annotations
  if (sidebarViewMode === "analysis" && selectedAnalysis) {
    const annotationCount = selectedAnalysis.annotations?.totalCount || 0;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <SidebarHeader>
          <BarChart3 size={20} style={{ color: "#f59e0b" }} />
          <SidebarHeaderContent>
            <SidebarHeaderTitle>
              <SafeMarkdown>
                {selectedAnalysis.analyzer.description ||
                  selectedAnalysis.analyzer.id}
              </SafeMarkdown>
            </SidebarHeaderTitle>
            <SidebarHeaderSubtitle>
              {annotationCount} annotation
              {annotationCount !== 1 ? "s" : ""} • Analysis Results
            </SidebarHeaderSubtitle>
          </SidebarHeaderContent>
        </SidebarHeader>
        <CompactAnnotationFeed>
          <UnifiedContentFeed
            notes={notes}
            filters={{
              contentTypes: new Set(["annotation", "relationship"]),
            }}
            sortBy="page"
            isLoading={loading}
            readOnly={readOnly}
            documentId={documentId}
            onItemSelect={(item) => {
              // Annotations from analysis
              if (item.type === "annotation" || item.type === "relationship") {
                // Already in document view, annotations will scroll into view
              }
            }}
          />
        </CompactAnnotationFeed>
      </div>
    );
  }

  // Handle unified feed mode
  if (sidebarViewMode === "feed") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {controlBar}
        <UnifiedContentFeed
          notes={notes}
          filters={feedFilters}
          sortBy={feedSortBy}
          isLoading={loading}
          readOnly={readOnly}
          documentId={documentId}
          onItemSelect={(item) => {
            // Handle item selection based on type
            if (item.type === "annotation" || item.type === "relationship") {
              setActiveLayer("document");
            }
            // For notes, we could open the note modal
            if (item.type === "note" && "creator" in item.data) {
              setSelectedNote(item.data as NoteType);
            }
          }}
        />
      </div>
    );
  }

  // Handle discussions mode
  if (sidebarViewMode === "discussions") {
    return (
      <DocumentDiscussionsContent documentId={documentId} corpusId={corpusId} />
    );
  }

  // Handle chat mode (default behavior)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {controlBar}
      <ChatTray
        setShowLoad={setShowLoad}
        showLoad={showLoad}
        documentId={documentId}
        onMessageSelect={() => {
          setActiveLayer("document");
        }}
        corpusId={corpusId}
        initialMessage={pendingChatMessage}
        readOnly={readOnly}
      />
    </div>
  );
};
