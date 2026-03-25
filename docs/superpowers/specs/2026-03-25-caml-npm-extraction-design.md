# CAML NPM Library Extraction

Extract the CAML (Corpus Article Markup Language) parser and React renderer from OpenContracts into two standalone npm packages under the `@os-legal` scope.

## Motivation

CAML is a human-readable markdown superset for rendering legal articles and knowledge bases. It currently lives inside the OpenContracts frontend. Extracting it enables:

- Reuse across projects without pulling in OpenContracts
- CLI tooling (linters, validators, VS Code extensions) via the framework-agnostic parser
- A standalone standard for legal article markup

## Packages

| Package | Purpose | Dependencies |
|---------|---------|--------------|
| `@os-legal/caml` | Parser, types, IR definition | Zero |
| `@os-legal/caml-react` | React renderer, theme system, default markdown | Peer: `react`, `styled-components`. Optional peer: `react-markdown`, `remark-gfm`, `rehype-sanitize` |

`@os-legal/caml-react` depends on `@os-legal/caml` as a runtime dependency.

## Repo Structure

Monorepo with yarn workspaces, single Git repo (`os-legal-caml`):

```
os-legal-caml/
├── packages/
│   ├── caml/                          → @os-legal/caml
│   │   ├── src/
│   │   │   ├── types.ts              # IR types
│   │   │   ├── tokenizer.ts          # Two-pass parser (frontmatter + fence tokenization)
│   │   │   ├── blockParsers.ts       # Block-specific parsing (cards, pills, tabs, etc.)
│   │   │   └── index.ts              # Public API: parseCaml + all type re-exports
│   │   ├── __tests__/
│   │   │   └── parseCaml.test.ts     # Existing parser tests (lifted as-is)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── caml-react/                    → @os-legal/caml-react
│       ├── src/
│       │   ├── CamlArticle.tsx        # Top-level renderer
│       │   ├── CamlHero.tsx           # Hero section
│       │   ├── CamlChapter.tsx        # Chapter section with theme/gradient support
│       │   ├── CamlBlocks.tsx         # Block type renderers (prose, cards, pills, tabs, etc.)
│       │   ├── CamlFooter.tsx         # Footer section
│       │   ├── CamlMarkdown.tsx       # NEW: default markdown renderer
│       │   ├── CamlThemeProvider.tsx   # NEW: theme context + provider
│       │   ├── theme.ts               # NEW: CamlTheme interface + defaultCamlTheme
│       │   ├── styles.ts              # Styled components (refactored to read from theme)
│       │   ├── safeHref.ts            # URL safety guard
│       │   └── index.ts               # Public API
│       ├── __tests__/
│       │   └── safeHref.test.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json                       # Workspaces root
├── tsconfig.base.json                 # Shared compiler options
├── vitest.config.ts                   # Shared test config
└── .changeset/                        # Changeset versioning config
```

## Build & Publish

- **Build**: `tsup` per package — ESM + CJS dual output with `.d.ts` generation.
- **Versioning**: `@changesets/cli` — changeset per PR, `changeset version` bumps packages and cross-dependencies atomically.
- **CI**: GitHub Actions — lint, test, build on PRs; publish to npm on release tags.

### `@os-legal/caml` package.json (key fields)

```json
{
  "name": "@os-legal/caml",
  "version": "0.1.0",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "dependencies": {},
  "devDependencies": {
    "tsup": "...",
    "typescript": "...",
    "vitest": "..."
  }
}
```

### `@os-legal/caml-react` package.json (key fields)

```json
{
  "name": "@os-legal/caml-react",
  "version": "0.1.0",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "dependencies": {
    "@os-legal/caml": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=17",
    "styled-components": ">=5",
    "react-markdown": ">=8",
    "remark-gfm": ">=3",
    "rehype-sanitize": ">=5"
  },
  "peerDependenciesMeta": {
    "react-markdown": { "optional": true },
    "remark-gfm": { "optional": true },
    "rehype-sanitize": { "optional": true }
  }
}
```

Markdown peer deps are optional — only needed if the consumer does not provide a custom `renderMarkdown` prop.

## `@os-legal/caml` — Parser Package

### Public API

```typescript
export { parseCaml } from "./tokenizer";
export type {
  CamlDocument, CamlFrontmatter, CamlHero, CamlFooter,
  CamlChapter, CamlBlock, CamlProse, CamlCards, CamlCardItem,
  CamlPills, CamlPillItem, CamlTabs, CamlTab, CamlTabSection,
  CamlTimeline, CamlCta, CamlCtaButton, CamlSignup,
  CamlCorpusStats, CamlAnnotationEmbed,
};
```

### Changes from Current Code

None to the logic. Only change: remove OC-specific comment in `types.ts`:

```typescript
// Before:
content: string; // Raw markdown (rendered by MarkdownMessageRenderer)
// After:
content: string; // Raw markdown
```

Tests (409 lines of `parseCaml.test.ts`) move as-is and pass unchanged.

## `@os-legal/caml-react` — Theme System

### `CamlTheme` Interface

Derived from actual token usage in the current `styles.ts` (80+ references to `OS_LEGAL_COLORS`/`OS_LEGAL_TYPOGRAPHY` + 4 references to `accentAlpha`):

```typescript
export interface CamlTheme {
  colors: {
    accent: string;
    accentHover: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    surface: string;
    surfaceLight: string;
    surfaceHover: string;
    border: string;
    heading: string;     // CAML-specific: deep dark slate for headings
    proseText: string;   // CAML-specific: article body text
    darkProse: string;   // CAML-specific: text on dark backgrounds
  };
  typography: {
    fontFamilySans: string;
    fontFamilySerif: string;
  };
  /** Derive an rgba string from the accent color at a given opacity. */
  accentAlpha: (opacity: number) => string;
}
```

### Default Theme

Ships the current OS Legal look out of the box:

```typescript
export const defaultCamlTheme: CamlTheme = {
  colors: {
    accent: "#0d9488",
    accentHover: "#0f766e",
    textPrimary: "#1e293b",
    textSecondary: "#475569",
    textTertiary: "#64748b",
    textMuted: "#94a3b8",
    surface: "#ffffff",
    surfaceLight: "#f8fafc",
    surfaceHover: "#f1f5f9",
    border: "#e2e8f0",
    heading: "#0f172a",
    proseText: "#334155",
    darkProse: "#cbd5e1",
  },
  typography: {
    fontFamilySans: "'Inter', system-ui, sans-serif",
    fontFamilySerif: "'Lora', 'Georgia', serif",
  },
  accentAlpha: (opacity) => `rgba(15, 118, 110, ${opacity})`,
};
```

### `CamlThemeProvider`

Wraps styled-components' `ThemeProvider` with CAML tokens namespaced under `theme.caml` to avoid collisions with consumer themes:

```typescript
import { createContext, useContext } from "react";
import { ThemeProvider } from "styled-components";

const CamlThemeContext = createContext<CamlTheme>(defaultCamlTheme);
export const useCamlTheme = () => useContext(CamlThemeContext);

export function CamlThemeProvider({
  theme: overrides,
  children,
}: {
  theme?: DeepPartial<CamlTheme>;
  children: ReactNode;
}) {
  const merged = deepMerge(defaultCamlTheme, overrides);
  return (
    <CamlThemeContext.Provider value={merged}>
      <ThemeProvider theme={{ caml: merged }}>
        {children}
      </ThemeProvider>
    </CamlThemeContext.Provider>
  );
}
```

### Impact on `styles.ts`

Every direct token reference becomes a theme read via styled-components' prop injection:

```typescript
// Before (in OC):
color: ${OS_LEGAL_COLORS.accent};
background: ${accentAlpha(0.04)};

// After (in library):
color: ${({ theme }) => theme.caml.colors.accent};
background: ${({ theme }) => theme.caml.accentAlpha(0.04)};
```

This is a mechanical find-and-replace across ~80 sites in `styles.ts`. No logic changes.

## `@os-legal/caml-react` — Markdown Rendering

### Render Slot Pattern

`CamlArticle` accepts an optional render function:

```typescript
interface CamlArticleProps {
  document: CamlDocument;
  stats?: {
    annotations?: number;
    documents?: number;
    contributors?: number;
    threads?: number;
  };
  renderMarkdown?: (content: string) => ReactNode;
}
```

`renderMarkdown` is threaded through `CamlArticle` → `CamlChapter` → `CamlBlockRenderer`. The two call sites in `CamlBlocks.tsx` become:

```typescript
// Before:
<MarkdownMessageRenderer content={section.content} />

// After:
{renderMarkdown
  ? renderMarkdown(section.content)
  : <CamlMarkdown content={section.content} />}
```

### Default `CamlMarkdown` Component

Thin wrapper around `react-markdown` with GFM and sanitization:

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function CamlMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {content}
    </ReactMarkdown>
  );
}
```

When `renderMarkdown` is not provided, the component falls back to `CamlMarkdown`. If the optional peer deps (`react-markdown`, `remark-gfm`, `rehype-sanitize`) are not installed, the import fails at build time with a clear error.

### `@os-legal/caml-react` Public API

```typescript
// Components
export { CamlArticle } from "./CamlArticle";
export type { CamlArticleProps } from "./CamlArticle";
export { CamlThemeProvider } from "./CamlThemeProvider";

// Theme
export { defaultCamlTheme } from "./theme";
export type { CamlTheme } from "./theme";

// Types re-exported from @os-legal/caml for convenience
export type { CamlDocument } from "@os-legal/caml";
```

## OpenContracts Integration (Consumer Side)

After extraction, `frontend/src/caml/` is deleted entirely. Two files change:

### `CamlArticleEditor.tsx`

```typescript
// Before:
import { parseCaml } from "../../caml";
import { CamlArticle } from "../../caml";

// After:
import { parseCaml } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";
import { MarkdownMessageRenderer } from "../threads/MarkdownMessageRenderer";
import { OS_LEGAL_COLORS, OS_LEGAL_TYPOGRAPHY, accentAlpha } from "../../assets/configurations/osLegalStyles";

// In the render:
<CamlThemeProvider theme={{
  colors: { ...OS_LEGAL_COLORS, heading: "#0f172a", proseText: "#334155", darkProse: "#cbd5e1" },
  typography: OS_LEGAL_TYPOGRAPHY,
  accentAlpha,
}}>
  <CamlArticle
    document={doc}
    stats={stats}
    renderMarkdown={(md) => <MarkdownMessageRenderer content={md} />}
  />
</CamlThemeProvider>
```

### `CorpusArticleView.tsx`

Same pattern — update imports, wrap in `CamlThemeProvider`, pass `renderMarkdown`.

### Deleted

- `frontend/src/caml/` — entire directory (~2,000 lines)

### Unchanged

- `CAML_ARTICLE_FILENAME` constant stays in OC (`frontend/src/assets/configurations/constants.ts`) — app-level convention, not a format concern.
- Backend `MarkdownParser` (`opencontractserver/pipeline/parsers/oc_markdown_parser.py`) — unrelated to the frontend library.

### Net OC Diff

~20 lines changed across 2 files, ~2,000 lines deleted.

## Development Workflow

During initial development, use yarn `link:` protocol or `file:` references in OC's `package.json` to develop both repos side-by-side:

```json
{
  "dependencies": {
    "@os-legal/caml": "link:../os-legal-caml/packages/caml",
    "@os-legal/caml-react": "link:../os-legal-caml/packages/caml-react"
  }
}
```

Once published to npm, OC consumes the packages normally via versioned dependencies.
