import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import { ExtractDetail } from "../src/views/ExtractDetail";
import {
  authToken,
  userObj,
  backendUserObj,
  openedExtract,
} from "../src/graphql/cache";
import type { ExtractType } from "../src/types/graphql-api";

const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      ExtractType: { keyFields: ["id"] },
      DocumentType: { keyFields: ["id"] },
      ColumnType: { keyFields: ["id"] },
      DatacellType: { keyFields: ["id"] },
      FieldsetType: { keyFields: ["id"] },
      CorpusType: { keyFields: ["id"] },
    },
  });

interface WrapperProps {
  extract: ExtractType | null;
  mocks?: MockedResponse[];
  /** Set to false to simulate unauthenticated state */
  authenticated?: boolean;
}

/**
 * Test wrapper for the ExtractDetail view.
 *
 * Exports ONLY the component — non-component helpers (factories, mock
 * builders) live in ExtractDetailFixtures.ts so Playwright CT's static
 * mount() transform can discover the wrapper correctly.
 */
export const ExtractDetailTestWrapper: React.FC<WrapperProps> = ({
  extract,
  mocks = [],
  authenticated = true,
}) => {
  const initialized = React.useRef(false);
  if (!initialized.current) {
    if (authenticated) {
      authToken("test-auth-token");
      userObj({
        id: "test-user-1",
        email: "test@example.com",
        username: "testuser",
        slug: "testuser",
      } as any);
      backendUserObj({
        id: "test-user-1",
        email: "test@example.com",
        username: "testuser",
        isUsageCapped: false,
      } as any);
    } else {
      authToken("");
      userObj(null);
      backendUserObj(null);
    }
    openedExtract(extract);
    initialized.current = true;
  }

  React.useEffect(() => {
    return () => {
      authToken("");
      userObj(null);
      backendUserObj(null);
      openedExtract(null);
    };
  }, []);

  const initialPath = extract ? `/extracts/${extract.id}` : "/extracts/unknown";

  return (
    <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
      <MemoryRouter initialEntries={[initialPath]}>
        <JotaiProvider>
          <div style={{ height: "100vh", width: "100vw" }}>
            <ExtractDetail />
          </div>
          <ToastContainer />
        </JotaiProvider>
      </MemoryRouter>
    </MockedProvider>
  );
};
