import React, { useMemo } from "react";
import { useQuery } from "@apollo/client";
import styled from "styled-components";
import { Icon } from "semantic-ui-react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  ChevronRight,
  ChevronDown,
  FolderTree,
  ListTree,
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
} from "../../assets/configurations/osLegalStyles";
import { DOCUMENT_RELATIONSHIP_TOC_LIMIT } from "../../assets/configurations/constants";

// ============================================================================
// TYPES
// ============================================================================

interface DocumentTableOfContentsProps {
  corpusId: string;
  maxDepth?: number;
}

interface DocumentNode {
  id: string;
  title: string;
  slug?: string;
  icon?: string;
  children: DocumentNode[];
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const Container = styled.div`
  padding: 16px;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: ${OS_LEGAL_SPACING.borderRadiusCard};
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
    padding: 24px;
    color: ${OS_LEGAL_COLORS.textMuted};
    font-style: italic;
  }
`;

const TreeNode = styled.div<{ $depth: number }>`
  margin-left: ${(props) => props.$depth * 20}px;
`;

const NodeItem = styled.div<{ $hasChildren: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: ${OS_LEGAL_COLORS.textPrimary};

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }

  .chevron {
    color: ${OS_LEGAL_COLORS.textMuted};
    flex-shrink: 0;
    opacity: ${(props) => (props.$hasChildren ? 1 : 0)};
  }

  .icon {
    color: ${OS_LEGAL_COLORS.accent};
    flex-shrink: 0;
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
  }
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: ${OS_LEGAL_COLORS.textMuted};
  gap: 8px;
`;

const ErrorState = styled.div`
  text-align: center;
  padding: 24px;
  color: #ef4444;
`;

// ============================================================================
// COMPONENT
// ============================================================================

export const DocumentTableOfContents: React.FC<
  DocumentTableOfContentsProps
> = ({ corpusId, maxDepth = 4 }) => {
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

  // Build tree from relationships
  const { rootNodes, hasParentRelationships } = useMemo(() => {
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
      return { rootNodes: [], hasParentRelationships: false };
    }

    // Build a map of document info
    const documentMap = new Map<
      string,
      { id: string; title: string; slug?: string; icon?: string }
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
        slug: rel.sourceDocument.slug,
        icon: rel.sourceDocument.icon,
      });
      documentMap.set(targetId, {
        id: targetId,
        title: rel.targetDocument.title || "Untitled",
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

    // Build tree recursively with depth limit and cycle detection
    const buildTree = (
      docId: string,
      currentDepth: number,
      visited: Set<string> = new Set()
    ): DocumentNode | null => {
      // Prevent infinite recursion from circular references
      if (visited.has(docId)) {
        console.warn(
          `Circular reference detected in document hierarchy: ${docId}`
        );
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

    return { rootNodes: roots, hasParentRelationships: true };
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

  // Render a tree node recursively
  const renderNode = (node: DocumentNode, depth: number) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <TreeNode key={node.id} $depth={depth}>
        <NodeItem
          $hasChildren={hasChildren}
          onClick={() => handleDocumentClick(node)}
        >
          <span
            className="chevron"
            onClick={(e) => hasChildren && toggleNode(node.id, e)}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )
            ) : (
              <span style={{ width: 14 }} />
            )}
          </span>
          <FileText size={14} className="icon" />
          <span className="title" title={node.title}>
            {node.title}
          </span>
        </NodeItem>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </TreeNode>
    );
  };

  if (loading) {
    return (
      <Container>
        <Header>
          <Title>
            <ListTree size={18} />
            Table of Contents
          </Title>
        </Header>
        <LoadingState>
          <Icon name="spinner" loading />
          Loading document structure...
        </LoadingState>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Header>
          <Title>
            <ListTree size={18} />
            Table of Contents
          </Title>
        </Header>
        <ErrorState>
          <Icon name="warning circle" />
          Failed to load document structure
        </ErrorState>
      </Container>
    );
  }

  if (!hasParentRelationships) {
    // Don't render anything if there are no parent relationships
    return null;
  }

  if (rootNodes.length === 0) {
    return (
      <Container>
        <Header>
          <Title>
            <ListTree size={18} />
            Table of Contents
          </Title>
        </Header>
        <TreeContainer>
          <div className="empty-state">
            No document hierarchy found. Create "parent" relationships between
            documents to build a table of contents.
          </div>
        </TreeContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>
          <ListTree size={18} />
          Table of Contents
        </Title>
      </Header>
      <TreeContainer>
        {rootNodes.map((node) => renderNode(node, 0))}
      </TreeContainer>
    </Container>
  );
};

export default DocumentTableOfContents;
