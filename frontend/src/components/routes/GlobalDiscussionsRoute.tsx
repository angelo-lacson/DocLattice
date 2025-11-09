import React from "react";
import { ErrorBoundary } from "../widgets/ErrorBoundary";
import { MetaTags } from "../widgets/MetaTags";
import { CardLayout } from "../layout/CardLayout";

/**
 * Route wrapper for global discussions view.
 * Shows all platform discussions with tabbed filtering.
 *
 * Part of Issue #623 - Global Discussions Forum View
 */
export const GlobalDiscussionsRoute: React.FC = () => {
  return (
    <ErrorBoundary>
      <MetaTags
        title="Discussions - OpenContracts"
        description="Browse all platform discussions"
        type="discussions"
      />
      <CardLayout>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Global Discussions</h1>
          <p>
            Feature in development - Issue #623
            <br />
            Backend infrastructure complete. Frontend UI coming soon.
          </p>
        </div>
      </CardLayout>
    </ErrorBoundary>
  );
};
