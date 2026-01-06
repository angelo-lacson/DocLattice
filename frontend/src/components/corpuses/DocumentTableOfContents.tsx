import React, { useMemo } from "react";
import { useQuery } from "@apollo/client";
import styled from "styled-components";
import { Icon } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  ChevronRight,
  ChevronDown,
  ListTree,
  AlertTriangle,
  File,
  FileSpreadsheet,
  FileImage,
  FileCode,
} from "lucide-react";

import {
  GET_DOCUMENT_RELATIONSHIPS,
  GetDocumentRelationshipsOutput,
  GetDocumentRelationshipsInput,
  DocumentRelationshipNode,
} from "../../graphql/queries";
import { openedCorpus } from "../../graphql/cache";
import { navigateToRelationshipDocument } from "../../utils/navigationUtils";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_SPACING,
  OS_LEGAL_TYPOGRAPHY,
} from "../../assets/configurations/osLegalStyles";
import { DOCUMENT_RELATIONSHIP_TOC_LIMIT } from "../../assets/configurations/constants";

// ============================================================================
// TYPES
// ============================================================================

interface DocumentTableOfContentsProps {
  corpusId: string;
  maxDepth?: number;
  /** When true, renders without outer container (for embedding in tabs) */
  embedded?: boolean;
}

interface DocumentNode {
  id: string;
  title: string;
  description?: string;
  fileType?: string;
  slug?: string;
  icon?: string;
  children: DocumentNode[];
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div<{ $embedded?: boolean }>`
  padding: ${(props) => (props.$embedded ? "20px 24px" : "16px")};
  background: ${OS_LEGAL_COLORS.surface};
  border: ${(props) =>
    props.$embedded ? "none" : `1px solid ${OS_LEGAL_COLORS.border}`};
  border-radius: ${(props) =>
    props.$embedded ? "0" : OS_LEGAL_SPACING.borderRadiusCard};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TreeContainer = styled.div`
  /* Empty state text */
  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: ${OS_LEGAL_COLORS.textMuted};

    .empty-icon {
      margin-bottom: 16px;
      color: ${OS_LEGAL_COLORS.border};
    }

    .empty-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: ${OS_LEGAL_COLORS.textSecondary};
      margin-bottom: 8px;
    }

    .empty-description {
      font-size: 0.875rem;
      max-width: 400px;
      margin: 0 auto;
      line-height: 1.5;
    }
  }
`;

const TreeNode = styled.div<{ $depth: number }>`
  margin-left: ${(props) => props.$depth * 24}px;
`;

const NodeItem = styled.div<{ $hasChildren: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 18px;
  margin: 6px 0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.border};
  }

  &:focus {
    outline: 2px solid ${OS_LEGAL_COLORS.accent};
    outline-offset: -2px;
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }

  &:focus-visible {
    outline: 2px solid ${OS_LEGAL_COLORS.accent};
    outline-offset: -2px;
  }
`;

const ChevronContainer = styled.span<{ $visible: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: ${OS_LEGAL_COLORS.textMuted};
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  cursor: ${(props) => (props.$visible ? "pointer" : "default")};
  border-radius: 4px;
  margin-top: 2px;

  &:hover {
    background: ${(props) =>
      props.$visible ? OS_LEGAL_COLORS.border : "transparent"};
  }
`;

const IconContainer = styled.div<{ $fileType?: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 10px;
  background: ${OS_LEGAL_COLORS.accentLight};
  color: ${OS_LEGAL_COLORS.accent};
`;

const NodeContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const NodeTitle = styled.div`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySerif};
  font-size: 1.0625rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  line-height: 1.35;
  margin-bottom: 6px;

  /* Allow wrapping but limit to 2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const NodeDescription = styled.div`
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textSecondary};
  line-height: 1.5;
  max-height: calc(1.5em * 2); /* Exactly 2 lines */

  /* Limit to 2 lines with ellipsis */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NodeMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
`;

const FileTypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: ${OS_LEGAL_COLORS.textMuted};
  gap: 12px;
`;

const ErrorState = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: ${OS_LEGAL_COLORS.danger};

  .error-icon {
    margin-bottom: 12px;
  }
`;

const WarningBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  color: #92400e;
  font-size: 0.875rem;

  .warning-icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  .warning-text {
    flex: 1;
    line-height: 1.4;
  }
`;

// ============================================================================
// HELPERS
// ============================================================================

/** Get icon component based on file type */
const getFileIcon = (fileType?: string) => {
  if (!fileType) return FileText;

  const type = fileType.toLowerCase();
  if (type.includes("pdf")) return FileText;
  if (type.includes("spreadsheet") || type.includes("excel") || type === "xlsx")
    return FileSpreadsheet;
  if (type.includes("image") || ["png", "jpg", "jpeg", "gif"].includes(type))
    return FileImage;
  if (
    type.includes("code") ||
    ["json", "xml", "html", "css", "js"].includes(type)
  )
    return FileCode;
  return File;
};

/** Format file type for display */
const formatFileType = (fileType?: string): string => {
  if (!fileType) return "Document";

  const type = fileType.toLowerCase();
  if (type.includes("pdf") || type === "application/pdf") return "PDF";
  if (type.includes("word") || type === "docx") return "Word";
  if (type.includes("excel") || type === "xlsx") return "Excel";
  if (type.includes("text") || type === "txt") return "Text";
  if (type.includes("image")) return "Image";

  // Return the type without extension or mime prefix
  return type
    .replace(/^application\//, "")
    .toUpperCase()
    .slice(0, 8);
};

// ============================================================================
// COMPONENT
// ============================================================================

export const DocumentTableOfContents: React.FC<
  DocumentTableOfContentsProps
> = ({ corpusId, maxDepth = 4, embedded = false }) => {
  const navigate = useNavigate();
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(
    new Set()
  );

  // Query for document relationships in this corpus
  const { data, loading, error } = useQuery<
    GetDocumentRelationshipsOutput,
    GetDocumentRelationshipsInput
  >(GET_DOCUMENT_RELATIONSHIPS, {
    variables: {
      corpusId,
      first: DOCUMENT_RELATIONSHIP_TOC_LIMIT,
    },
    skip: !corpusId,
    fetchPolicy: "cache-and-network",
  });

  // Check if we've hit the limit (potential truncation)
  const totalCount = data?.documentRelationships?.totalCount ?? 0;
  const isLimitExceeded = totalCount > DOCUMENT_RELATIONSHIP_TOC_LIMIT;

  // Build tree from relationships
  const {
    rootNodes,
    hasParentRelationships,
    hasCircularRefs,
    circularRefDocs,
  } = useMemo(() => {
    const relationships = data?.documentRelationships?.edges || [];

    // Filter to only "parent" labeled relationships
    const parentRelationships = relationships
      .map((e) => e.node)
      .filter(
        (rel): rel is DocumentRelationshipNode =>
          rel != null &&
          rel.relationshipType === "RELATIONSHIP" &&
          rel.annotationLabel?.text?.toLowerCase() === "parent"
      );

    if (parentRelationships.length === 0) {
      return {
        rootNodes: [],
        hasParentRelationships: false,
        hasCircularRefs: false,
        circularRefDocs: [],
      };
    }

    // Build a map of document info
    const documentMap = new Map<
      string,
      {
        id: string;
        title: string;
        description?: string;
        fileType?: string;
        slug?: string;
        icon?: string;
      }
    >();

    // Build parent-children map
    // In "parent" relationships: source has parent target (i.e., target is parent of source)
    // So: source.parent = target
    const parentMap = new Map<string, string>(); // child -> parent
    const childrenMap = new Map<string, string[]>(); // parent -> children

    parentRelationships.forEach((rel) => {
      const sourceId = rel.sourceDocument.id;
      const targetId = rel.targetDocument.id;

      // Store document info
      documentMap.set(sourceId, {
        id: sourceId,
        title: rel.sourceDocument.title || "Untitled",
        description: rel.sourceDocument.description || undefined,
        fileType: rel.sourceDocument.fileType || undefined,
        slug: rel.sourceDocument.slug,
        icon: rel.sourceDocument.icon,
      });
      documentMap.set(targetId, {
        id: targetId,
        title: rel.targetDocument.title || "Untitled",
        description: rel.targetDocument.description || undefined,
        fileType: rel.targetDocument.fileType || undefined,
        slug: rel.targetDocument.slug,
        icon: rel.targetDocument.icon,
      });

      // Source's parent is target (source "has parent" target)
      parentMap.set(sourceId, targetId);

      // Target has source as a child
      const existing = childrenMap.get(targetId) || [];
      childrenMap.set(targetId, [...existing, sourceId]);
    });

    // Find root documents (those that appear as parents but have no parents themselves)
    const allDocIds = new Set([...documentMap.keys()]);
    const rootDocIds = Array.from(allDocIds).filter((id) => !parentMap.has(id));

    // Track circular references for user warning
    const circularRefs: string[] = [];

    // Build tree recursively with depth limit and cycle detection
    const buildTree = (
      docId: string,
      currentDepth: number,
      visited: Set<string> = new Set()
    ): DocumentNode | null => {
      // Prevent infinite recursion from circular references
      if (visited.has(docId)) {
        const docTitle = documentMap.get(docId)?.title || docId;
        circularRefs.push(docTitle);
        return null;
      }
      if (currentDepth > maxDepth) return null;

      const docInfo = documentMap.get(docId);
      if (!docInfo) return null;

      // Add current node to visited set for this branch
      const branchVisited = new Set(visited).add(docId);

      const childIds = childrenMap.get(docId) || [];
      // Sort children alphabetically by title
      const sortedChildIds = [...childIds].sort((a, b) => {
        const titleA = documentMap.get(a)?.title || "";
        const titleB = documentMap.get(b)?.title || "";
        return titleA.localeCompare(titleB);
      });

      const children = sortedChildIds
        .map((childId) => buildTree(childId, currentDepth + 1, branchVisited))
        .filter((child): child is DocumentNode => child !== null);

      return {
        id: docInfo.id,
        title: docInfo.title,
        description: docInfo.description,
        fileType: docInfo.fileType,
        slug: docInfo.slug,
        icon: docInfo.icon,
        children,
      };
    };

    // Build trees from root nodes, sorted alphabetically
    const roots = rootDocIds
      .map((id) => buildTree(id, 0, new Set()))
      .filter((node): node is DocumentNode => node !== null)
      .sort((a, b) => a.title.localeCompare(b.title));

    return {
      rootNodes: roots,
      hasParentRelationships: true,
      hasCircularRefs: circularRefs.length > 0,
      circularRefDocs: circularRefs,
    };
  }, [data, maxDepth]);

  // Handle document click - uses shared utility for type safety
  const handleDocumentClick = (doc: {
    id: string;
    title: string;
    slug?: string;
  }) => {
    const corpus = openedCorpus();
    navigateToRelationshipDocument(
      doc,
      corpus,
      navigate,
      window.location.pathname
    );
  };

  // Toggle expand/collapse
  const toggleNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Handle keyboard navigation for accessibility
  const handleKeyDown = (
    e: React.KeyboardEvent,
    node: DocumentNode,
    hasChildren: boolean,
    isExpanded: boolean
  ) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        handleDocumentClick(node);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (hasChildren && !isExpanded) {
          setExpandedNodes((prev) => new Set(prev).add(node.id));
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (hasChildren && isExpanded) {
          setExpandedNodes((prev) => {
            const next = new Set(prev);
            next.delete(node.id);
            return next;
          });
        }
        break;
    }
  };

  // Render a tree node recursively
  const renderNode = (node: DocumentNode, depth: number) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const FileIcon = getFileIcon(node.fileType);

    return (
      <TreeNode key={node.id} $depth={depth}>
        <NodeItem
          $hasChildren={hasChildren}
          onClick={() => handleDocumentClick(node)}
          onKeyDown={(e) => handleKeyDown(e, node, hasChildren, isExpanded)}
          role="treeitem"
          tabIndex={0}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-label={`${node.title}${
            hasChildren ? `, ${isExpanded ? "expanded" : "collapsed"}` : ""
          }`}
        >
          <ChevronContainer
            $visible={hasChildren}
            onClick={(e) => hasChildren && toggleNode(node.id, e)}
            aria-hidden="true"
          >
            {hasChildren &&
              (isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              ))}
          </ChevronContainer>

          <IconContainer $fileType={node.fileType}>
            <FileIcon size={22} />
          </IconContainer>

          <NodeContent>
            <NodeTitle title={node.title}>{node.title}</NodeTitle>
            {node.description && (
              <NodeDescription title={node.description}>
                {node.description}
              </NodeDescription>
            )}
            <NodeMeta>
              <FileTypeBadge>{formatFileType(node.fileType)}</FileTypeBadge>
            </NodeMeta>
          </NodeContent>
        </NodeItem>
        {hasChildren && isExpanded && (
          <div role="group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </TreeNode>
    );
  };

  // Wrapper component that conditionally renders container
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? (
      <Container $embedded>{children}</Container>
    ) : (
      <Container>
        <Header>
          <Title>
            <ListTree size={18} />
            Table of Contents
          </Title>
        </Header>
        {children}
      </Container>
    );

  if (loading) {
    return (
      <Wrapper>
        <LoadingState>
          <Icon name="spinner" loading size="big" />
          <span>Loading document structure...</span>
        </LoadingState>
      </Wrapper>
    );
  }

  if (error) {
    return (
      <Wrapper>
        <ErrorState>
          <Icon name="warning circle" size="big" className="error-icon" />
          <div>Failed to load document structure</div>
        </ErrorState>
      </Wrapper>
    );
  }

  if (!hasParentRelationships || rootNodes.length === 0) {
    return (
      <Wrapper>
        <TreeContainer>
          <div className="empty-state">
            <ListTree size={48} className="empty-icon" />
            <div className="empty-title">No Document Hierarchy</div>
            <div className="empty-description">
              Create &ldquo;parent&rdquo; relationships between documents to
              build a navigable table of contents for this corpus.
            </div>
          </div>
        </TreeContainer>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      {isLimitExceeded && (
        <WarningBanner role="alert">
          <AlertTriangle size={18} className="warning-icon" />
          <span className="warning-text">
            Showing first {DOCUMENT_RELATIONSHIP_TOC_LIMIT} of {totalCount}{" "}
            relationships. Some documents may not appear in the hierarchy.
          </span>
        </WarningBanner>
      )}
      {hasCircularRefs && (
        <WarningBanner role="alert">
          <AlertTriangle size={18} className="warning-icon" />
          <span className="warning-text">
            Circular parent references detected. Some documents may not appear
            in the hierarchy. Check the parent relationships for:{" "}
            {circularRefDocs.slice(0, 3).join(", ")}
            {circularRefDocs.length > 3 &&
              ` and ${circularRefDocs.length - 3} more`}
          </span>
        </WarningBanner>
      )}
      <TreeContainer role="tree" aria-label="Document hierarchy">
        {rootNodes.map((node) => renderNode(node, 0))}
      </TreeContainer>
    </Wrapper>
  );
};

export default DocumentTableOfContents;
