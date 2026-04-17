# E2E Test Coverage Expansion

## Problem

Frontend code coverage is ~52% project-wide (~40% frontend-only). The existing E2E spec (`login-and-navigation.spec.ts`) visits all 13 list views but only checks that text renders — no interactions, no data, no detail routes. The largest untested components are views and their child components, totaling ~20K lines in the top 16 files alone.

## Goal

Add E2E tests that exercise real user workflows to boost frontend coverage through the views layer. E2E tests are preferred over component tests here because a single workflow (create corpus → upload document → view annotations) exercises code paths across many components simultaneously.

## Approach

Two new spec files alongside the existing navigation spec, using UI-driven data creation (no fixtures) so the CRUD paths themselves contribute coverage.

## Spec 1: `corpus-workflow.spec.ts` — Deep CRUD Workflow

A single serial test that walks the primary user journey:

### Steps

1. **Login** via `loginViaUI()`
2. **Create corpus** — click "Create" button on `/corpuses`, fill the modal (title + description), submit, wait for the new corpus to appear in the list
3. **Navigate to corpus detail** — click the corpus card/link, verify the corpus landing page renders with tabs (Documents, Annotations, Extracts, etc.)
4. **Upload a `.txt` document** — open the upload modal, attach a programmatically created text file (~5 sentences), submit, wait for processing to complete (synchronous via `CELERY_TASK_ALWAYS_EAGER`)
5. **Open document viewer** — click the document, verify the document detail route renders with the text content and parsed annotations
6. **Browse annotations** — verify annotation sidebar populates with sentence-level annotations from TxtParser
7. **Navigate to extracts** — go to `/extracts`, verify the list renders
8. **Return to corpus** — navigate back, verify document count updated

### Test Document

A hardcoded 5-sentence `.txt` string created inline:

```
OpenContracts is a document analytics platform.
It supports PDF and text-based document formats.
Users can annotate documents and create structured extracts.
The platform uses machine learning for document parsing.
This is a test document for end-to-end coverage testing.
```

Uploaded via Playwright's `page.setInputFiles()` using a `Buffer`.

### Components Exercised

| Component | Lines | Interaction |
|-----------|-------|-------------|
| `Corpuses.tsx` | 3,193 | Create modal, list rendering, navigation |
| `Documents.tsx` | 1,759 | Upload modal, document list |
| Upload modal components | ~680 | Full upload flow |
| Document detail route | ~200 | Document viewer rendering |
| Annotator components | ~2,000+ | Annotation sidebar, text display |
| `Extracts.tsx` | 575 | List rendering with data |

## Spec 2: `view-interactions.spec.ts` — Shallow Breadth

Short interaction tests for each list view plus admin routes. Reuses data created by the workflow spec (shared database, `workers: 1`).

### List View Interactions

For each view, exercise one or two interactive features:

| View | Interaction |
|------|------------|
| `/corpuses` | Toggle between grid/list view, use search filter |
| `/documents` | Use search filter, verify document from workflow appears |
| `/annotations` | Use search/filter controls |
| `/extracts` | Open create-extract modal, close it |
| `/label_sets` | Open create modal, close it |
| `/discussions` | Verify empty state or search |
| `/` (landing) | Click through tabs/sections |

### Admin Routes

Navigate to each admin route as the superuser and verify rendering:

- `/admin/settings` — Global settings panel
- `/system_settings` — System settings with tabs

### Detail Routes (using workflow data)

Navigate to the corpus and document created by the workflow spec:

- Corpus detail via slug URL
- Document detail via slug URL

### Components Exercised

| Component | Lines | Interaction |
|-----------|-------|-------------|
| `LabelSets.tsx` | 581 | Create modal open/close |
| `Annotations.tsx` | 753 | Filter/search controls |
| `GlobalDiscussions.tsx` | 449 | Empty state or search |
| `DiscoveryLanding.tsx` | 413 | Section navigation |
| Admin components | ~2,819 | Route rendering |
| Various modals | ~2,000+ | Open/close flows |

## Helpers to Add (`helpers.ts`)

```typescript
// Create a corpus via the UI create modal
createCorpusViaUI(page, title, description): Promise<void>

// Upload a text document via the upload modal
uploadDocumentViaUI(page, filename, content): Promise<void>

// Wait for document processing to complete (polls UI status)
waitForDocumentProcessed(page, timeoutMs?): Promise<void>

// Admin views added to VIEWS catalog
ADMIN_VIEWS: ViewSpec[]
```

## Test Execution Order

Playwright runs specs alphabetically with `workers: 1` on CI:

1. `corpus-workflow.spec.ts` — creates data
2. `login-and-navigation.spec.ts` — existing, no data dependency
3. `view-interactions.spec.ts` — uses data from step 1

## Environment Constraints

- **Parser**: TxtParser (spacy, included in Django image) — no external containers needed
- **Embedder**: `TestEmbedder` (configured in `config.settings.test`) — no vector service needed
- **Celery**: `CELERY_TASK_ALWAYS_EAGER = True` — tasks run synchronously in Django process
- **Auth**: In-memory token — must use `spaNavigate()` after login, never `page.goto()`
- **Timeout**: 90s per test on CI (adequate for synchronous parsing)
- **Coverage**: Istanbul instrumentation via existing `fixtures.ts`

## What This Does NOT Cover

- File uploads requiring ML parsers (PDF via Docling/LlamaParse)
- Multi-user permission flows
- WebSocket-based features (real-time updates)
- Mobile/responsive layouts

These are explicitly out of scope for this pass.

## Success Criteria

- Both new spec files pass in CI (`frontend-e2e.yml` workflow)
- Frontend Istanbul coverage increases measurably (target: +5-10% on `frontend-e2e` flag)
- No increase in CI wall-clock time beyond ~3 minutes (synchronous parsing is fast for small text files)
- Existing `login-and-navigation.spec.ts` continues to pass unchanged
