import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { WorkerAccountManagement } from "../src/components/admin/WorkerAccountManagement";

interface WrapperProps {
  mocks?: MockedResponse[];
}

export const WorkerAccountManagementTestWrapper: React.FC<WrapperProps> = ({
  mocks = [],
}) => (
  <MockedProvider mocks={mocks} addTypename={false}>
    <MemoryRouter initialEntries={["/admin/worker-accounts"]}>
      <WorkerAccountManagement />
      <ToastContainer />
    </MemoryRouter>
  </MockedProvider>
);
