# CAML Citation Flagging — `{{@agent command}}` Directive System

**Status**: Draft
**Date**: 2026-03-29
**Depends on**: CAML v1 (shipped), `@os-legal/caml` v0.0.3

## Problem

Authors writing CAML articles want to flag sentences, paragraphs, or blocks
for an AI agent to come back and insert the best matching citations from the
corpus. Today, citations must be manually constructed.

## Design

A two-phase approach: the parser extracts lightweight **inline directives**;
the host application (OpenContracts) **resolves** them against the corpus
using vector similarity search.

### Syntax

```caml
::: chapter {#findings}
## Key Findings

The force majeure clauses were updated across all agreements. {{@cite sentence}}

Multiple jurisdictions require different notice periods.
These range from 30 to 90 days depending on the governing law. {{@cite paragraph}}

:::: cards {columns: 2}
- **Payment Terms** | #0f766e
  Net-30 payment terms were standard across 87% of contracts.
  {{@cite block}}
::::
:::
```

**General form**: `{{@<agent> <scope> [key=value ...]}}`

| Token     | Meaning | Examples |
|-----------|---------|----------|
| `@agent`  | Which agent handles this directive | `@cite`, `@review`, `@summarize` |
| `scope`   | How much surrounding text to use as context | `sentence`, `paragraph`, `block` |
| `key=val` | Optional parameters | `mode=all`, `limit=5`, `label=force-majeure` |

### Scope Resolution

| Scope       | Context extracted |
|-------------|------------------|
| `sentence`  | The sentence containing the directive (split on `.!?` boundaries) |
| `paragraph` | The paragraph (text between blank lines) containing the directive |
| `block`     | The entire enclosing CAML block's text content |

## Architecture

### Phase 1 — Parser (`@os-legal/caml` upstream)

The parser gains a single new function: `extractInlineDirectives()`.

**Key design decision**: `CamlProse.content` stays a plain string for backward
compatibility. Directives are extracted into an optional `directives` array.
Old renderers that only read `content` are unaffected.

```typescript
// New types added to @os-legal/caml
interface CamlInlineDirective {
  agent: string;            // "cite", "review", etc.
  scope: "sentence" | "paragraph" | "block";
  args: Record<string, string>;  // key=value pairs
  context: string;          // resolved surrounding text
  offset: number;           // character offset in content where directive appeared
}

// CamlProse gains an optional field
interface CamlProse {
  type: "prose";
  content: string;                       // raw markdown, directives stripped
  directives?: CamlInlineDirective[];    // extracted directives with context
}
```

The parser:
1. Regex-matches `{{@(\w+)\s+(\w+)(?:\s+(.+?))?}}` in prose content
2. For each match, resolves the `scope` to extract surrounding context
3. Strips the directive from `content` (so markdown renderers don't show it)
4. Appends to `directives[]` with the resolved context text

### Phase 2 — Directive Handler Registry (Host Application)

The parser extracts directives without knowing what any agent does. The host
application registers handlers for each agent name via a **directive registry**.

```typescript
// directiveRegistry.ts — ships in @os-legal/caml-react or host app

type DirectiveHandlerHook = (
  directive: CamlInlineDirective,
  context: DirectiveHandlerContext
) => DirectiveHandlerResult;

// Register at module load
registerDirectiveHandler("cite", useCiteHandler);
registerDirectiveHandler("review", useReviewHandler);
```

Each handler is a React hook that:
- Receives the parsed directive + application context (corpus ID, etc.)
- Returns `{ loading, node, error }` — the renderer displays `node` inline

This design means:
- `@os-legal/caml` knows nothing about citations, reviews, or any agent
- `@os-legal/caml-react` provides a generic `renderDirective` slot
- Host apps register handlers — different apps can support different agents
- Adding a new agent = writing one hook + one `registerDirectiveHandler()` call

### Phase 3 — Rendering (Generic Renderer)

**`CamlDirectiveRenderer`** wraps `CamlArticle` and:
1. Walks the parsed `CamlDocument` extracting directives from prose blocks
2. Strips directive syntax from content (clean markdown for rendering)
3. For each directive, looks up the registered handler by agent name
4. Renders handler output via `DirectiveSlot` components after each prose block

### OpenContracts-Specific Handlers

**`useCiteHandler`** — resolves `@cite` directives using the existing
`SEMANTIC_SEARCH_ANNOTATIONS` GraphQL query (hybrid vector+text search).
Returns `CamlCitationChip` components — hover-expandable pills showing
annotation snippet, document title, similarity score, and deep link.

## File Changes

### Upstream (`@os-legal/caml`)
- `packages/caml/src/types.ts` — Add `CamlInlineDirective`, extend `CamlProse`
- `packages/caml/src/inlineDirectives.ts` — New: `extractInlineDirectives()` (pure, zero-dep)
- `packages/caml/src/tokenizer.ts` — Call `extractInlineDirectives()` on prose blocks
- `packages/caml/src/index.ts` — Re-export new types

### Upstream (`@os-legal/caml-react`)
- `packages/caml-react/src/CamlArticle.tsx` — Thread `renderDirective` slot
- `packages/caml-react/src/CamlBlocks.tsx` — Prose block renders directive slots
- `packages/caml-react/src/directiveRegistry.ts` — Optional: ship registry as convenience

### OpenContracts
- `frontend/src/components/corpuses/caml/directiveRegistry.ts` — Handler registry
- `frontend/src/components/corpuses/caml/CamlDirectiveRenderer.tsx` — Generic renderer
- `frontend/src/components/corpuses/caml/useCiteHandler.tsx` — @cite handler (OC-specific)
- `frontend/src/components/corpuses/caml/CamlCitationChip.tsx` — Citation chip component
- `frontend/src/components/corpuses/CorpusHome/CorpusArticleView.tsx` — Wire renderer + register handlers

## Backwards Compatibility

- `CamlProse.directives` is optional — old documents produce `undefined`
- `CamlProse.content` has directives stripped — old renderers show clean text
- The `renderDirective` slot is optional — if not provided, directives are invisible
- No backend changes required — uses existing `semanticSearch` GraphQL query

## Known Limitations

- **One query per directive**: Each `@cite` directive fires an independent
  `semanticSearch` GraphQL query. A document with 10 directives will issue
  10 parallel requests. Acceptable for typical article sizes but may need
  batching (e.g., a `semanticSearchBatch` query or client-side deduplication)
  for documents with many citations.
- **`mode=all` default limit**: When `mode=all` is used without an explicit
  `limit`, the handler defaults to 5 results (`ALL_MODE_DEFAULT_LIMIT`).

## Future Extensions

The `{{@agent scope}}` syntax is generic. Future agents:
- `{{@review paragraph}}` — flag for human review
- `{{@summarize block}}` — auto-generate block summary
- `{{@translate sentence lang=es}}` — translation placeholder
- `{{@cite sentence mode=all limit=5}}` — multiple citations with params
