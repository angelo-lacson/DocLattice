import React, { useEffect, useCallback } from "react";
import { useReactiveVar } from "@apollo/client";
import { useNavigate, useLocation } from "react-router-dom";
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
import { navigationCircuitBreaker } from "../../utils/navigationCircuitBreaker";
import { routingLogger } from "../../utils/routingLogger";

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
  const baseNavigate = useNavigate();
  const location = useLocation();

  // Wrapped navigate with circuit breaker
  const navigate = useCallback(
    (to: string) => {
      const source = "DocumentLandingRoute";
      routingLogger.debug(`🧭 [${source}] navigate() called:`, {
        to,
        currentUrl: location.pathname + location.search,
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split("\n").slice(2, 5).join("\n"),
      });

      if (!navigationCircuitBreaker.recordNavigation(to, source)) {
        console.error(`❌ [${source}] Navigation BLOCKED by circuit breaker!`);
        return;
      }

      baseNavigate(to);
    },
    [baseNavigate, location]
  );

  // Read state from reactive vars (set by CentralRouteManager)
  const document = useReactiveVar(openedDocument);
  const corpus = useReactiveVar(openedCorpus);
  const loading = useReactiveVar(routeLoading);
  const error = useReactiveVar(routeError);

  routingLogger.debug("[DocumentLandingRoute] 🔄 Render triggered", {
    hasDocument: !!document,
    documentId: document?.id,
    documentSlug: document?.slug,
    hasCorpus: !!corpus,
    corpusId: corpus?.id,
    corpusSlug: corpus?.slug,
    loading,
    hasError: !!error,
    timestamp: Date.now(),
  });

  // Track reactive var changes
  useEffect(() => {
    routingLogger.debug("[DocumentLandingRoute] 📡 openedDocument changed", {
      hasDocument: !!document,
      documentId: document?.id,
      documentSlug: document?.slug,
    });
  }, [document]);

  useEffect(() => {
    routingLogger.debug("[DocumentLandingRoute] 📡 openedCorpus changed", {
      hasCorpus: !!corpus,
      corpusId: corpus?.id,
      corpusSlug: corpus?.slug,
    });
  }, [corpus]);

  useEffect(() => {
    routingLogger.debug("[DocumentLandingRoute] 📡 routeLoading changed", {
      loading,
    });
  }, [loading]);

  // Close handler: Navigate back to previous route, or fall back to corpus/documents
  // Uses browser history when available (user navigated from within the app)
  // Falls back to corpus home or /documents for direct URL access (bookmarks, shared links)
  const handleClose = useCallback(() => {
    const timestamp = new Date().toISOString();
    routingLogger.debug(
      `🚪 [DocumentLandingRoute] ════════ handleClose START ════════`
    );
    routingLogger.debug("[DocumentLandingRoute] Timestamp:", timestamp);
    routingLogger.debug("[DocumentLandingRoute] Current state:", {
      currentUrl: location.pathname + location.search,
      referrer: window.document.referrer,
      historyLength: window.history.length,
      hasCorpus: !!corpus,
      corpusSlug: corpus?.slug,
    });

    // Check if user navigated here from within the app (same origin)
    const referrer = window.document.referrer;
    const sameOrigin =
      referrer && new URL(referrer).origin === window.location.origin;

    if (sameOrigin) {
      // User came from within the app - go back to previous route
      routingLogger.debug(
        "[DocumentLandingRoute] ✅ Decision: Navigate back (same origin referrer)"
      );
      baseNavigate(-1);
    } else if (corpus?.creator?.slug && corpus?.slug) {
      // Direct access with corpus context - go to corpus home
      const targetUrl = `/c/${corpus.creator.slug}/${corpus.slug}`;
      routingLogger.debug(
        `[DocumentLandingRoute] ✅ Decision: Navigate to corpus (no referrer)`
      );
      navigate(targetUrl);
    } else {
      // Direct access without corpus - go to documents list
      routingLogger.debug(
        "[DocumentLandingRoute] ⚠️  Decision: Navigate to /documents (no referrer, no corpus)"
      );
      navigate("/documents");
    }

    routingLogger.debug(
      `[DocumentLandingRoute] ════════ handleClose END ════════`
    );
  }, [corpus, baseNavigate, navigate, location]);

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
