import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useReactiveVar } from "@apollo/client";
import { MetaTags } from "../seo/MetaTags";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { ModernErrorDisplay } from "../widgets/ModernErrorDisplay";
import { ErrorBoundary } from "../widgets/ErrorBoundary";
import { openedExtract } from "../../graphql/cache";
import { ExtractDetail } from "../../views/ExtractDetail";
import {
  RESOLVE_EXTRACT_BY_ID,
  ResolveExtractByIdOutput,
  ResolveExtractByIdInput,
} from "../../graphql/queries";

/**
 * ExtractDetailRoute - Handles the /extracts/:extractId route
 *
 * This is the new route-based pattern for viewing extract details,
 * replacing the modal-based EditExtractModal.
 *
 * Route pattern: /extracts/:extractId
 */
export const ExtractDetailRoute: React.FC = () => {
  const { extractId } = useParams<{ extractId: string }>();

  // Check if we already have the extract from reactive var
  const existingExtract = useReactiveVar(openedExtract);

  // Query to resolve extract by ID if not already loaded
  const { loading, error, data } = useQuery<
    ResolveExtractByIdOutput,
    ResolveExtractByIdInput
  >(RESOLVE_EXTRACT_BY_ID, {
    variables: { extractId: extractId ?? "" },
    skip: !extractId || existingExtract?.id === extractId,
    fetchPolicy: "network-only",
  });

  // Set the opened extract when query completes
  useEffect(() => {
    if (data?.extract) {
      openedExtract(data.extract);
    }
  }, [data]);

  // Handle missing extractId
  if (!extractId) {
    return <ModernErrorDisplay type="extract" error="No extract ID provided" />;
  }

  // Loading state
  if (loading && !existingExtract) {
    return <ModernLoadingDisplay type="extract" size="large" />;
  }

  // Error state
  if (error) {
    return (
      <ModernErrorDisplay
        type="extract"
        error={error.message || "Failed to load extract"}
      />
    );
  }

  // Get the extract to display
  const extract =
    existingExtract?.id === extractId ? existingExtract : data?.extract;

  // Not found state
  if (!extract && !loading) {
    return <ModernErrorDisplay type="extract" error="Extract not found" />;
  }

  return (
    <ErrorBoundary>
      <MetaTags
        title={extract?.name || "Extract"}
        description={`Extract: ${extract?.name}`}
        entity={extract}
        entityType="extract"
      />
      <ExtractDetail />
    </ErrorBoundary>
  );
};

export default ExtractDetailRoute;
