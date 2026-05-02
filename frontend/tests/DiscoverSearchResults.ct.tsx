// Playwright Component Tests for DiscoverSearchResults (cross-content discover search).
import React from "react";
import { test, expect } from "./utils/coverage";
import { MockedResponse } from "@apollo/client/testing";
import { DiscoverSearchResults } from "../src/views/DiscoverSearchResults";
import { LandingTestWrapper } from "./LandingTestWrapper";
import { docScreenshot } from "./utils/docScreenshot";
import {
  GET_CONVERSATIONS,
  GET_CORPUSES,
  SEARCH_ANNOTATIONS_FOR_MENTION,
  SEARCH_NOTES_FOR_MENTION,
} from "../src/graphql/queries";

const buildEmptyMocks = (textSearch: string): MockedResponse[] => [
  {
    request: {
      query: GET_CONVERSATIONS,
      variables: {
        textSearch,
        type: "THREAD",
        chatWithCorpusVisible: true,
        limit: 5,
      },
    },
    result: { data: { conversations: { edges: [] } } },
  },
  {
    request: {
      query: SEARCH_ANNOTATIONS_FOR_MENTION,
      variables: { textSearch, first: 5 },
    },
    result: { data: { searchAnnotationsForMention: { edges: [] } } },
  },
  {
    request: {
      query: GET_CORPUSES,
      variables: { textSearch, limit: 5 },
    },
    result: { data: { corpuses: { edges: [] } } },
  },
  {
    request: {
      query: SEARCH_NOTES_FOR_MENTION,
      variables: { textSearch, first: 5 },
    },
    result: { data: { searchNotesForMention: { edges: [] } } },
  },
];

test("DiscoverSearchResults — empty prompt is shown before any query is typed", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <LandingTestWrapper mocks={[]}>
      <DiscoverSearchResults />
    </LandingTestWrapper>
  );

  await expect(
    component.getByRole("heading", { name: "Search" })
  ).toBeVisible();
  await expect(
    component.getByText("Type to search across content you can access.")
  ).toBeVisible();

  await docScreenshot(page, "discover--search-results--empty-prompt");
});

test("DiscoverSearchResults — typing a query renders all four section headers", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <LandingTestWrapper mocks={buildEmptyMocks("indemnity")}>
      <DiscoverSearchResults />
    </LandingTestWrapper>
  );

  // Search box debounces by 250ms.
  const searchBox = component.getByPlaceholder(
    "Search across legal knowledge…"
  );
  await searchBox.fill("indemnity");
  await page.waitForTimeout(400);

  await expect(component.getByText("Discussions").first()).toBeVisible();
  await expect(component.getByText("Annotations").first()).toBeVisible();
  await expect(component.getByText("Collections").first()).toBeVisible();
  await expect(component.getByText("Notes").first()).toBeVisible();
});
