import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { GlobalSettingsPanel } from "../src/components/admin/GlobalSettingsPanel";
import { GlobalAgentManagement } from "../src/components/admin/GlobalAgentManagement";
import { CorpusAgentManagement } from "../src/components/corpuses/CorpusAgentManagement";

// Wrapper for GlobalSettingsPanel with routing context
export const GlobalSettingsPanelWrapper: React.FC = () => (
  <MemoryRouter>
    <GlobalSettingsPanel />
  </MemoryRouter>
);

// Wrapper for GlobalAgentManagement with Apollo mocking
interface GlobalAgentManagementWrapperProps {
  mocks?: MockedResponse[];
}

export const GlobalAgentManagementWrapper: React.FC<
  GlobalAgentManagementWrapperProps
> = ({ mocks = [] }) => (
  <MockedProvider mocks={mocks} addTypename={false}>
    <GlobalAgentManagement />
  </MockedProvider>
);

// Wrapper for CorpusAgentManagement with Apollo mocking
interface CorpusAgentManagementWrapperProps {
  corpusId: string;
  canUpdate: boolean;
  mocks?: MockedResponse[];
}

export const CorpusAgentManagementWrapper: React.FC<
  CorpusAgentManagementWrapperProps
> = ({ corpusId, canUpdate, mocks = [] }) => (
  <MockedProvider mocks={mocks} addTypename={false}>
    <CorpusAgentManagement corpusId={corpusId} canUpdate={canUpdate} />
  </MockedProvider>
);
