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
        conversationType: "THREAD",
        title_Contains: textSearch,
        limit: 5,
      },
    },
    result: { data: { conversations: { edges: [], totalCount: 0 } } },
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

const buildPopulatedMocks = (textSearch: string): MockedResponse[] => [
  {
    request: {
      query: GET_CONVERSATIONS,
      variables: {
        conversationType: "THREAD",
        title_Contains: textSearch,
        limit: 5,
      },
    },
    result: {
      data: {
        conversations: {
          edges: [
            {
              node: {
                id: "Q29udjox",
                conversationType: "THREAD",
                title: "Indemnity caps in vendor MSAs",
                description: "How aggressive are folks getting on caps?",
                createdAt: "2026-04-01T12:00:00Z",
                updatedAt: "2026-04-02T12:00:00Z",
                creator: {
                  id: "VXNlcjox",
                  username: "alice",
                  email: "alice@example.com",
                },
                chatWithCorpus: {
                  id: "Q29ycHVzOjE=",
                  title: "Vendor Agreements",
                  slug: "vendor-agreements",
                  creator: { id: "VXNlcjox", slug: "alice", username: "alice" },
                },
                chatWithDocument: null,
                chatMessages: { totalCount: 12 },
                isPublic: true,
                myPermissions: ["READ"],
                upvoteCount: 3,
                downvoteCount: 0,
                userVote: null,
                isLocked: false,
                lockedBy: null,
                lockedAt: null,
                isPinned: false,
                pinnedBy: null,
                pinnedAt: null,
                deletedAt: null,
              },
            },
          ],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
          },
          totalCount: 1,
        },
      },
    },
  },
  {
    request: {
      query: SEARCH_ANNOTATIONS_FOR_MENTION,
      variables: { textSearch, first: 5 },
    },
    result: {
      data: {
        searchAnnotationsForMention: {
          edges: [
            {
              node: {
                id: "QW5uOjE=",
                rawText:
                  "Vendor shall indemnify Customer against any third-party claim…",
                page: 4,
                annotationLabel: {
                  id: "TGFiOjE=",
                  text: "Indemnification",
                  color: "#ef4444",
                },
                document: {
                  id: "RG9jOjE=",
                  title: "Master Services Agreement",
                  slug: "msa",
                  creator: { id: "VXNlcjox", slug: "alice" },
                },
                corpus: {
                  id: "Q29ycHVzOjE=",
                  title: "Vendor Agreements",
                  slug: "vendor-agreements",
                  creator: { id: "VXNlcjox", slug: "alice" },
                },
              },
            },
          ],
        },
      },
    },
  },
  {
    request: {
      query: GET_CORPUSES,
      variables: { textSearch, limit: 5 },
    },
    result: {
      data: {
        corpuses: {
          edges: [
            {
              node: {
                id: "Q29ycHVzOjE=",
                slug: "vendor-agreements",
                icon: null,
                title: "Vendor Agreements",
                creator: { email: "alice@example.com", slug: "alice" },
                description:
                  "Standard vendor agreements with indemnity carve-outs.",
                isPublic: true,
                isPersonal: false,
                myPermissions: ["READ"],
                documentCount: 12,
                parent: null,
                labelSet: null,
                categories: [],
                license: null,
                licenseLink: null,
              },
            },
          ],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
          },
        },
      },
    },
  },
  {
    request: {
      query: SEARCH_NOTES_FOR_MENTION,
      variables: { textSearch, first: 5 },
    },
    result: {
      data: {
        searchNotesForMention: {
          edges: [
            {
              node: {
                id: "Tm90ZTox",
                title: "Indemnity drafting tips",
                contentPreview:
                  "Always **cap** indemnification obligations. See `MSA §12.4`.",
                modified: "2026-04-15T09:00:00Z",
                creator: { id: "VXNlcjox", username: "alice", slug: "alice" },
                document: {
                  id: "RG9jOjE=",
                  title: "Master Services Agreement",
                  slug: "msa",
                  creator: { id: "VXNlcjox", slug: "alice" },
                },
                corpus: {
                  id: "Q29ycHVzOjE=",
                  title: "Vendor Agreements",
                  slug: "vendor-agreements",
                  creator: { id: "VXNlcjox", slug: "alice" },
                },
              },
            },
          ],
        },
      },
    },
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

test("DiscoverSearchResults — populated results render rows for every section", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <LandingTestWrapper mocks={buildPopulatedMocks("indemnity")}>
      <DiscoverSearchResults />
    </LandingTestWrapper>
  );

  const searchBox = component.getByPlaceholder(
    "Search across legal knowledge…"
  );
  await searchBox.fill("indemnity");
  // 250ms debounce + Apollo settle
  await page.waitForTimeout(700);

  // Discussion thread surfaced (rendered by ThreadListItem)
  await expect(
    component.getByText("Indemnity caps in vendor MSAs")
  ).toBeVisible();

  // Annotation row — rawText becomes title
  await expect(
    component.getByText(/Vendor shall indemnify Customer/)
  ).toBeVisible();

  // Collection row — title plus document count meta
  await expect(component.getByText("Vendor Agreements").first()).toBeVisible();
  await expect(component.getByText(/12 docs/)).toBeVisible();

  // Note row — title + Markdown-stripped snippet (no `**` or backticks)
  await expect(component.getByText("Indemnity drafting tips")).toBeVisible();
  const noteSnippet = component.getByText(/Always cap indemnification/);
  await expect(noteSnippet).toBeVisible();
  await expect(noteSnippet).not.toContainText("**");
  await expect(noteSnippet).not.toContainText("`");

  // Capture the populated state for documentation.
  await docScreenshot(page, "discover--search-results--with-results");
});

// Tab-switching mocks: All-tab defaults (first/limit=5) plus the entity-tab
// notes query (first=25) so the click resolves cleanly.
const buildNotesEntityTabMocks = (textSearch: string): MockedResponse[] => [
  ...buildEmptyMocks(textSearch),
  {
    request: {
      query: SEARCH_NOTES_FOR_MENTION,
      variables: { textSearch, first: 25 },
    },
    result: {
      data: {
        searchNotesForMention: {
          edges: [
            {
              node: {
                id: "Tm90ZTox",
                title: "Indemnity drafting tips",
                contentPreview: "Plain preview body.",
                modified: "2026-04-15T09:00:00Z",
                creator: { id: "VXNlcjox", username: "alice", slug: "alice" },
                document: {
                  id: "RG9jOjE=",
                  title: "Master Services Agreement",
                  slug: "msa",
                  creator: { id: "VXNlcjox", slug: "alice" },
                },
                corpus: {
                  id: "Q29ycHVzOjE=",
                  title: "Vendor Agreements",
                  slug: "vendor-agreements",
                  creator: { id: "VXNlcjox", slug: "alice" },
                },
              },
            },
          ],
        },
      },
    },
  },
];

test("DiscoverSearchResults — selecting the Notes tab hides the other sections", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <LandingTestWrapper mocks={buildNotesEntityTabMocks("indemnity")}>
      <DiscoverSearchResults />
    </LandingTestWrapper>
  );

  const searchBox = component.getByPlaceholder(
    "Search across legal knowledge…"
  );
  await searchBox.fill("indemnity");

  // FilterTabs renders each entity option as a `.oc-filter-tab` button.
  // Wait for debounce so the All-tab default queries don't intercept the
  // notes-tab variables, then switch tabs.
  await page.waitForTimeout(300);
  await component.locator(".oc-filter-tab", { hasText: "Notes" }).click();
  await page.waitForTimeout(700);

  // Only the Notes section header renders; Discussions/Annotations/
  // Collections section headers must not appear.
  await expect(component.locator("text=Indemnity drafting tips")).toBeVisible();
  // SectionTitle "Notes" lives inside an h2 — assert it's mounted.
  await expect(component.locator("h2", { hasText: "Notes" })).toBeVisible();
  await expect(component.locator("h2", { hasText: "Discussions" })).toHaveCount(
    0
  );
  await expect(component.locator("h2", { hasText: "Annotations" })).toHaveCount(
    0
  );
  await expect(component.locator("h2", { hasText: "Collections" })).toHaveCount(
    0
  );
});

test("DiscoverSearchResults — section error renders the recoverable fallback", async ({
  mount,
  page,
}) => {
  // Erroring mocks for every section so each Section renders its error
  // branch (`error && !data`).
  const errorMocks: MockedResponse[] = [
    {
      request: {
        query: GET_CONVERSATIONS,
        variables: {
          conversationType: "THREAD",
          title_Contains: "boom",
          limit: 5,
        },
      },
      error: new Error("Conversations service unavailable"),
    },
    {
      request: {
        query: SEARCH_ANNOTATIONS_FOR_MENTION,
        variables: { textSearch: "boom", first: 5 },
      },
      error: new Error("Annotations service unavailable"),
    },
    {
      request: {
        query: GET_CORPUSES,
        variables: { textSearch: "boom", limit: 5 },
      },
      error: new Error("Corpuses service unavailable"),
    },
    {
      request: {
        query: SEARCH_NOTES_FOR_MENTION,
        variables: { textSearch: "boom", first: 5 },
      },
      error: new Error("Notes service unavailable"),
    },
  ];

  const component = await mount(
    <LandingTestWrapper mocks={errorMocks}>
      <DiscoverSearchResults />
    </LandingTestWrapper>
  );

  await component
    .getByPlaceholder("Search across legal knowledge…")
    .fill("boom");
  await page.waitForTimeout(700);

  // Each Section maps a query error to a stable user-facing message.
  const errorAlerts = component.getByRole("alert");
  await expect(errorAlerts.first()).toBeVisible();
  await expect(errorAlerts.first()).toContainText(
    "We couldn't load these results"
  );
  // All four sections error simultaneously.
  await expect(errorAlerts).toHaveCount(4);
});
