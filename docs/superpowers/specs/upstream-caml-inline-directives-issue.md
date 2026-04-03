# Upstream Issue: Inline Directive System for CAML

> **Target repo**: Open-Source-Legal/caml
> **Packages affected**: `@os-legal/caml`, `@os-legal/caml-react`

---

## Title

feat: Inline directive system — `{{@agent scope [args]}}` syntax

## Body

### Problem

CAML articles need a way to mark positions in prose where a host application should perform some action — find citations, flag for review, insert summaries, etc. Today there is no mechanism for this; the v2 spec proposed `{{cite-me}}` / `{{cite-all}}` but these are hard-coded to a single use case.

### Proposal

Add a **generic inline directive system** to the parser. The syntax:

```
{{@<agent> <scope> [key=value ...]}}
```

Examples:
```caml
The force majeure clauses were updated. {{@cite sentence}}

Multiple jurisdictions require different notice periods.
These range from 30 to 90 days. {{@cite paragraph mode=all limit=5}}

{{@review block reason="stale data"}}

{{@summarize block max_words=100}}
```

The parser extracts these as structured tokens. It does **not** interpret them — all semantics come from the host application.

### Scope

| Scope | Context extracted |
|---|---|
| `sentence` | Text between sentence boundaries (`.!?` + whitespace) preceding the directive |
| `paragraph` | Text between blank lines containing the directive |
| `block` | The entire enclosing CAML block content |

### Proposed Types (`@os-legal/caml`)

```typescript
interface CamlInlineDirective {
  agent: string;            // "cite", "review", "summarize", etc.
  scope: "sentence" | "paragraph" | "block";
  args: Record<string, string>;
  context: string;          // resolved surrounding text at the requested scope
  offset: number;           // character position in original content
}

// CamlProse gains an optional field (backward compatible)
interface CamlProse {
  type: "prose";
  content: string;                       // directives stripped (clean markdown)
  directives?: CamlInlineDirective[];    // extracted directives with context
}
```

### Proposed API

New export from `@os-legal/caml`:

```typescript
function extractInlineDirectives(content: string): {
  content: string;                  // cleaned content
  directives: CamlInlineDirective[];
}
```

This is called internally by `parseCaml()` when building prose blocks, populating `CamlProse.directives`. It's also exported for consumers who need to run extraction independently.

### Proposed Render Slot (`@os-legal/caml-react`)

`CamlArticle` gains an optional `renderDirective` prop:

```typescript
interface CamlArticleProps {
  document: CamlDocument;
  stats?: CamlStats;
  renderMarkdown?: (content: string) => ReactNode;
  renderAnnotationEmbed?: (ref: string) => ReactNode;
  renderDirective?: (directive: CamlInlineDirective) => ReactNode;  // NEW
}
```

When provided, the prose block renderer calls `renderDirective` at each directive position. When not provided, directives are invisible (content is still cleaned).

### Reference Implementation

We have a working prototype in OpenContracts ([branch `claude/caml-citation-flagging-AwKgO`](https://github.com/Open-Source-Legal/OpenContracts/tree/claude/caml-citation-flagging-AwKgO)) that includes:

- **`inlineDirectives.ts`** — Pure extraction function (zero-dep, liftable as-is into `packages/caml/src/`)
- **`directiveRegistry.ts`** — Consumer-side handler registry pattern
- **`CamlDirectiveRenderer.tsx`** — Generic renderer dispatching to registered handlers
- **`useCiteHandler.tsx`** — OC-specific `@cite` handler using vector similarity search
- **18 unit tests** covering extraction, scope resolution, arg parsing, and registry

The extraction function handles:
- Regex: `{{@(\w+)\s+(sentence|paragraph|block)(?:\s+([^}]+?))?\}\}`
- Backward-looking scope resolution (directives follow the text they refer to)
- Quoted and unquoted `key=value` argument parsing
- Clean stripping from content

### Design Principles

1. **Parser is agent-agnostic** — `@os-legal/caml` extracts tokens without knowing what `@cite` or `@review` means
2. **Renderer provides the slot** — `@os-legal/caml-react` threads `renderDirective` without importing any handler
3. **Host apps register handlers** — OpenContracts registers `@cite`, another app might register `@translate`
4. **Backward compatible** — `CamlProse.directives` is optional; `content` is always clean markdown
5. **Zero new dependencies** — extraction is pure string manipulation

### Backward Compatibility

- Old documents without directives: `directives` is `undefined`, no behavior change
- Old renderers that only read `content`: see clean markdown, directives stripped
- `renderDirective` slot is optional: if not provided, directives are invisible
- No changes to any existing block type

### Files to Change

**`@os-legal/caml`**:
- `src/types.ts` — Add `CamlInlineDirective`, add optional `directives` to `CamlProse`
- `src/inlineDirectives.ts` — New file: `extractInlineDirectives()`
- `src/tokenizer.ts` — Call extraction in `parseChapter()` when building prose blocks
- `src/index.ts` — Re-export `CamlInlineDirective`, `extractInlineDirectives`

**`@os-legal/caml-react`**:
- `src/CamlArticle.tsx` — Accept + thread `renderDirective` prop
- `src/CamlBlocks.tsx` — `ProseBlock` calls `renderDirective` at directive positions
- `src/index.ts` — Update `CamlArticleProps` export
