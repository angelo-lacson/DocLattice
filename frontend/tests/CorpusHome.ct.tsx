import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedResponse } from "@apollo/client/testing";
import { CorpusType } from "../src/types/graphql-api";
import { CorpusHomeTestWrapper } from "./CorpusHomeTestWrapper";
import {
  GET_CORPUS_STATS,
  GET_CORPUS_WITH_HISTORY,
  GET_DOCUMENT_RELATIONSHIPS,
} from "../src/graphql/queries";
import { DOCUMENT_RELATIONSHIP_TOC_LIMIT } from "../src/assets/configurations/constants";
import { PermissionTypes } from "../src/components/types";

/* --------------------------------------------------------------------------
 * Mock data & helpers
 * -------------------------------------------------------------------------- */
const dummyCorpus: CorpusType = {
  id: "CORPUS_1",
  title: "Playwright Test Corpus",
  isPublic: false,
  description: "Dummy corpus for component-testing CorpusHome.",
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  creator: {
    id: "USER_1",
    email: "tester@example.com",
    __typename: "UserType",
  },
  labelSet: null,
  allowComments: true,
  preferredEmbedder: null,
  myPermissions: [
    "update_corpus",
    "read_corpus",
  ] as unknown as PermissionTypes[],
  analyses: {
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    edges: [],
  },
  annotations: {
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    edges: [],
  },
  documents: {
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    edges: [],
  },
  __typename: "CorpusType",
};

// Document relationships mock - used for DocumentTableOfContents
// Must include parent relationships for TOC to render content
const documentRelationshipsMock: MockedResponse = {
  request: {
    query: GET_DOCUMENT_RELATIONSHIPS,
    variables: {
      corpusId: dummyCorpus.id,
      first: DOCUMENT_RELATIONSHIP_TOC_LIMIT,
    },
  },
  result: {
    data: {
      documentRelationships: {
        edges: [
          {
            node: {
              id: "rel-1",
              relationshipType: "RELATIONSHIP",
              data: null,
              sourceDocument: {
                id: "doc-child",
                title: "Child Document",
                icon: null,
                slug: "child-document",
                creator: { slug: "test-user" },
              },
              targetDocument: {
                id: "doc-parent",
                title: "Parent Document",
                icon: null,
                slug: "parent-document",
                creator: { slug: "test-user" },
              },
              annotationLabel: {
                id: "label-1",
                text: "parent",
                color: "#3b82f6",
                icon: null,
              },
              corpus: { id: dummyCorpus.id },
              creator: { id: "USER_1", username: "testuser" },
              created: "2025-01-01T00:00:00Z",
              modified: "2025-01-01T00:00:00Z",
              myPermissions: ["read"],
              __typename: "DocumentRelationshipType",
            },
            __typename: "DocumentRelationshipTypeEdge",
          },
        ],
        totalCount: 1,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        __typename: "DocumentRelationshipTypeConnection",
      },
    },
  },
};

const mocks: MockedResponse[] = [
  {
    request: {
      query: GET_CORPUS_STATS,
      variables: { corpusId: dummyCorpus.id },
    },
    result: {
      data: {
        corpusStats: {
          totalDocs: 3,
          totalAnnotations: 5,
          totalAnalyses: 0,
          totalExtracts: 0,
          __typename: "CorpusStatsType",
        },
      },
    },
  },
  // Duplicate for cache-and-network fetch policy
  documentRelationshipsMock,
  { ...documentRelationshipsMock },
  {
    request: {
      query: GET_CORPUS_WITH_HISTORY,
      variables: { id: dummyCorpus.id },
    },
    result: {
      data: {
        corpus: {
          id: dummyCorpus.id,
          slug: "test-corpus",
          title: dummyCorpus.title,
          description: dummyCorpus.description,
          mdDescription: null,
          created: dummyCorpus.created,
          modified: dummyCorpus.modified,
          isPublic: dummyCorpus.isPublic,
          myPermissions: dummyCorpus.myPermissions,
          creator: dummyCorpus.creator,
          labelSet: dummyCorpus.labelSet,
          descriptionRevisions: [],
          __typename: "CorpusType",
        },
      },
    },
  },
];

/**
 * Mount helper – wraps CorpusHome in MockedProvider with minimal cache.
 */
function mountCorpusHome(mount: any) {
  return mount(<CorpusHomeTestWrapper mocks={mocks} corpus={dummyCorpus} />);
}

/* --------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------- */

test.use({ viewport: { width: 1200, height: 800 } });

test("defaults to About tab when no homeView URL param", async ({
  mount,
  page,
}) => {
  await mountCorpusHome(mount);

  // About tab should be active by default
  const aboutTab = page.getByRole("tab", { name: "About" });
  await expect(aboutTab).toHaveAttribute("aria-selected", "true");

  // TOC tab should not be selected
  const tocTab = page.getByRole("tab", { name: "Table of Contents" });
  await expect(tocTab).toHaveAttribute("aria-selected", "false");

  // About content should be visible
  const aboutPanel = page.locator("#about-panel");
  await expect(aboutPanel).toBeVisible();
});

test("shows TOC tab when homeView=toc URL param is set", async ({
  mount,
  page,
}) => {
  // Mount with initialHomeView="toc"
  await mount(
    <CorpusHomeTestWrapper
      mocks={mocks}
      corpus={dummyCorpus}
      initialHomeView="toc"
    />
  );

  // TOC tab should be active
  const tocTab = page.getByRole("tab", { name: "Table of Contents" });
  await expect(tocTab).toHaveAttribute("aria-selected", "true");

  // About tab should not be selected
  const aboutTab = page.getByRole("tab", { name: "About" });
  await expect(aboutTab).toHaveAttribute("aria-selected", "false");

  // TOC panel should be visible
  const tocPanel = page.locator("#toc-panel");
  await expect(tocPanel).toBeVisible();
});

test("switching tabs updates URL (via click)", async ({ mount, page }) => {
  await mountCorpusHome(mount);

  // Initially on About tab
  const aboutTab = page.getByRole("tab", { name: "About" });
  await expect(aboutTab).toHaveAttribute("aria-selected", "true");

  // Click TOC tab
  const tocTab = page.getByRole("tab", { name: "Table of Contents" });
  await tocTab.click();

  // TOC tab should now be selected
  await expect(tocTab).toHaveAttribute("aria-selected", "true");
  await expect(aboutTab).toHaveAttribute("aria-selected", "false");

  // TOC panel should be visible
  const tocPanel = page.locator("#toc-panel");
  await expect(tocPanel).toBeVisible();
});

test("renders corpus hero, chat bar and description controls", async ({
  mount,
  page,
}) => {
  await mountCorpusHome(mount);

  /* ------------------------------------------------------------------
   * Hero section (title, privacy badge, breadcrumbs)
   * ------------------------------------------------------------------ */
  const hero = page.getByTestId("corpus-home-hero");
  await expect(hero).toBeVisible();

  // Breadcrumbs are rendered
  await expect(hero.locator("text=Corpuses")).toBeVisible();

  // Title contains corpus name with "Corpus" accent
  const title = page.getByTestId("corpus-home-hero-title");
  await expect(title).toBeVisible();
  await expect(title.locator("text=Corpus")).toBeVisible();
  await expect(title).toContainText(dummyCorpus.title);

  // Privacy badge reflects corpus.isPublic
  const privacyText = dummyCorpus.isPublic ? "Public" : "Private";
  await expect(hero.locator(`text=${privacyText}`)).toBeVisible();

  /* ------------------------------------------------------------------
   * Inline chat bar
   * ------------------------------------------------------------------ */
  const chatBar = page.getByTestId("corpus-home-hero-chat");
  await expect(chatBar).toBeVisible();

  // Chat input placeholder
  await expect(
    chatBar.locator('textarea[placeholder*="Ask a question"]')
  ).toBeVisible();

  // Quick action chips
  await expect(chatBar.locator("text=Summarize")).toBeVisible();
  await expect(chatBar.locator("text=Search")).toBeVisible();
  await expect(chatBar.locator("text=Analyze")).toBeVisible();

  /* ------------------------------------------------------------------
   * Description card
   * ------------------------------------------------------------------ */
  const descriptionCard = page.locator("#corpus-home-description-card");
  await expect(descriptionCard).toBeVisible();

  // Section heading
  await expect(descriptionCard.locator("text=About this Corpus")).toBeVisible();

  // Description text
  await expect(
    descriptionCard.locator(
      "text=Dummy corpus for component-testing CorpusHome."
    )
  ).toBeVisible();

  /* ------------------------------------------------------------------
   * Action buttons (Version History + Edit Description)
   * ------------------------------------------------------------------ */
  await expect(
    page.getByRole("button", { name: "Version History" })
  ).toBeVisible();

  // Either "Edit Description" or "Add Description" should be available depending on permissions
  await expect(
    page.getByRole("button", { name: /(?:Edit|Add)/i })
  ).toBeVisible();
});
