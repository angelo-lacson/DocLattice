import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedProvider } from "@apollo/client/testing";
import { CorpusDashboard } from "../src/components/corpuses/CorpusDashboard";
import { GET_CORPUS_STATS } from "../src/graphql/queries";
import { docScreenshot } from "./utils/docScreenshot";

const mockCorpus = {
  id: "Q29ycHVzVHlwZTox",
  title: "Test Corpus",
  __typename: "CorpusType",
} as any;

const statsMock = {
  request: {
    query: GET_CORPUS_STATS,
    variables: { corpusId: mockCorpus.id },
  },
  result: {
    data: {
      corpusStats: {
        totalDocs: 42,
        totalComments: 18,
        totalAnalyses: 7,
        totalExtracts: 15,
        totalAnnotations: 256,
        totalThreads: 5,
        totalChats: 3,
        totalRelationships: 12,
      },
    },
  },
};

test.describe("CorpusDashboard", () => {
  test("renders dashboard with corpus statistics", async ({ mount, page }) => {
    await mount(
      <MockedProvider mocks={[statsMock]} addTypename={false}>
        <CorpusDashboard corpus={mockCorpus} />
      </MockedProvider>
    );

    // Wait for the stats to load and animate
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByText("Annotations")).toBeVisible();
    await expect(page.getByText("Analyses")).toBeVisible();
    await expect(page.getByText("Extracts")).toBeVisible();
    await expect(page.getByText("Comments")).toBeVisible();

    await docScreenshot(page, "corpus--dashboard--with-stats");
  });

  test("renders loading state before data arrives", async ({ mount, page }) => {
    const slowMock = {
      ...statsMock,
      delay: 5000,
    };

    await mount(
      <MockedProvider mocks={[slowMock]} addTypename={false}>
        <CorpusDashboard corpus={mockCorpus} />
      </MockedProvider>
    );

    // The dashboard header should still be visible while loading
    await expect(page.getByText("Corpus Dashboard")).toBeVisible();

    await docScreenshot(page, "corpus--dashboard--loading");
  });
});
