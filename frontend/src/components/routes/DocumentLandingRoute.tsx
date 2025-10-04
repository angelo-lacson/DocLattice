import React from "react";
import { useNavigate } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import { DocumentKnowledgeBase } from "../knowledge_base";
import { MetaTags } from "../seo/MetaTags";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { ModernErrorDisplay } from "../widgets/ModernErrorDisplay";
import { ErrorBoundary } from "../widgets/ErrorBoundary";
import {
  openedDocument,
  openedCorpus,
  routeLoading,
  routeError,
} from "../../graphql/cache";

/**
 * DocumentLandingRoute - Handles all document routes with explicit /d/ prefix
 *
 * Route patterns:
 * - /d/:userIdent/:corpusIdent/:docIdent (document within a corpus)
 * - /d/:userIdent/:docIdent (standalone document)
 *
 * Query parameters (URL-driven state) - managed by CentralRouteManager:
 * - ?ann=id1,id2,id3 - Comma-separated annotation IDs to select/highlight
 * - ?analysis=id1,id2 - Comma-separated analysis IDs to filter/display
 * - ?extract=id1,id2 - Comma-separated extract IDs to filter/display
 *
 * This component is now a DUMB CONSUMER - it just reads state set by CentralRouteManager.
 */
export const DocumentLandingRoute: React.FC = () => {
  const navigate = useNavigate();

  // Read state from reactive vars (set by CentralRouteManager)
  const document = useReactiveVar(openedDocument);
  const corpus = useReactiveVar(openedCorpus);
  const loading = useReactiveVar(routeLoading);
  const error = useReactiveVar(routeError);

  // Handle close navigation
  const handleClose = React.useCallback(() => {
    // Navigate back to corpus if we have one, otherwise to documents list
    if (corpus && corpus.creator?.slug && corpus.slug) {
      const canonicalCorpusPath = `/c/${corpus.creator.slug}/${corpus.slug}`;
      navigate(canonicalCorpusPath);
    } else {
      navigate("/documents");
    }
  }, [corpus, navigate]);

  // Note: We now let DocumentKnowledgeBase determine read-only status
  // based on the actual permissions available in the component tree

  if (loading) {
    return <ModernLoadingDisplay type="document" size="large" />;
  }

  if (error || !document) {
    return (
      <ModernErrorDisplay
        type="document"
        error={error || "Document not found"}
      />
    );
  }

  return (
    <ErrorBoundary>
      <MetaTags
        title={document.title || "Document"}
        description={document.description || ""}
        entity={document}
        entityType="document"
      />
      <DocumentKnowledgeBase
        documentId={document.id}
        corpusId={corpus?.id}
        onClose={handleClose}
      />
    </ErrorBoundary>
  );
};

export default DocumentLandingRoute;
