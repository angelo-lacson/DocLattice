import React, { useEffect } from "react";
import { useReactiveVar } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { ModernErrorDisplay } from "../widgets/ModernErrorDisplay";
import { openedExtract, routeLoading, routeError } from "../../graphql/cache";

/**
 * ExtractLandingRoute - Handles legacy extract routes with explicit /e/ prefix
 *
 * Route pattern:
 * - /e/:userIdent/:extractId (extract by ID, slugs not yet supported)
 *
 * This component redirects to the new /extracts/:extractId route.
 * It reads state set by CentralRouteManager and redirects when extract is loaded.
 */
export const ExtractLandingRoute: React.FC = () => {
  const navigate = useNavigate();

  // Read state from reactive vars (set by CentralRouteManager)
  const extract = useReactiveVar(openedExtract);
  const loading = useReactiveVar(routeLoading);
  const error = useReactiveVar(routeError);

  console.log("[ExtractLandingRoute] 🔄 Render triggered", {
    hasExtract: !!extract,
    loading,
    hasError: !!error,
  });

  // Redirect to new route when extract is loaded
  useEffect(() => {
    if (extract?.id && !loading && !error) {
      navigate(`/extracts/${extract.id}`, { replace: true });
    }
  }, [extract, loading, error, navigate]);

  if (loading) {
    return <ModernLoadingDisplay type="extract" size="large" />;
  }

  if (error || !extract) {
    return (
      <ModernErrorDisplay type="extract" error={error || "Extract not found"} />
    );
  }

  // Show loading while redirecting
  return <ModernLoadingDisplay type="extract" size="large" />;
};

export default ExtractLandingRoute;
