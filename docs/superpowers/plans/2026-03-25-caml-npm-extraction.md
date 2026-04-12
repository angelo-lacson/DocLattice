# CAML NPM Library Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the CAML parser and React renderer from OpenContracts into two standalone npm packages (`@os-legal/caml` and `@os-legal/caml-react`) in a yarn workspaces monorepo.

**Architecture:** Monorepo with two packages — a zero-dependency parser and a React renderer with theme injection. The parser is a direct lift of existing code. The renderer decouples from OC's design system via a `CamlThemeProvider` and replaces the hardcoded `MarkdownMessageRenderer` with an injectable render slot.

**Tech Stack:** TypeScript, tsup (build), vitest (test), @changesets/cli (versioning), yarn workspaces, styled-components, react-markdown

**Spec:** `docs/superpowers/specs/2026-03-25-caml-npm-extraction-design.md`

---

## File Structure

### New repo: `os-legal-caml/`

```
os-legal-caml/
├── package.json                       # Workspaces root
├── tsconfig.base.json                 # Shared TS config
├── vitest.config.ts                   # Shared test config
├── LICENSE                            # MIT
├── .changeset/
│   └── config.json                    # Changesets config
├── packages/
│   ├── caml/                          # @os-legal/caml
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── types.ts              # Lifted from frontend/src/caml/parser/types.ts
│   │   │   ├── tokenizer.ts          # Lifted from frontend/src/caml/parser/tokenizer.ts
│   │   │   ├── blockParsers.ts       # Lifted from frontend/src/caml/parser/blockParsers.ts
│   │   │   └── index.ts              # Public API barrel
│   │   └── __tests__/
│   │       └── parseCaml.test.ts     # Lifted from frontend/src/caml/parser/__tests__/
│   └── caml-react/                    # @os-legal/caml-react
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── src/
│       │   ├── theme.ts              # NEW: CamlTheme, CamlStats, defaultCamlTheme, DeepPartial, deepMerge
│       │   ├── CamlThemeProvider.tsx  # NEW: Theme context + styled-components ThemeProvider wrapper
│       │   ├── CamlMarkdown.tsx      # NEW: Default markdown renderer
│       │   ├── CamlArticle.tsx       # Lifted + modified: adds renderMarkdown/renderAnnotationEmbed props
│       │   ├── CamlHero.tsx          # Lifted + modified: import path fix
│       │   ├── CamlChapter.tsx       # Lifted + modified: threads renderMarkdown/renderAnnotationEmbed
│       │   ├── CamlBlocks.tsx        # Lifted + modified: replaces MarkdownMessageRenderer, threads props
│       │   ├── CamlFooter.tsx        # Lifted + modified: import path fix
│       │   ├── safeHref.ts           # Lifted as-is
│       │   ├── styles.ts             # Lifted + modified: OS_LEGAL_* → theme.caml.* (~100 replacements)
│       │   └── index.ts              # Public API barrel
│       └── __tests__/
│           └── safeHref.test.ts      # Lifted from frontend/src/caml/renderer/__tests__/
```

### Modified in OpenContracts (after library is published):

```
frontend/src/caml/                              # DELETED entirely
frontend/src/components/corpuses/
  CamlArticleEditor.tsx                         # MODIFIED: update imports
frontend/src/components/corpuses/CorpusHome/
  CorpusArticleView.tsx                         # MODIFIED: update imports
frontend/package.json                           # MODIFIED: add @os-legal/caml, @os-legal/caml-react deps
```

---

## Task 1: Create Monorepo Scaffold

**Files:**
- Create: `os-legal-caml/package.json`
- Create: `os-legal-caml/tsconfig.base.json`
- Create: `os-legal-caml/vitest.config.ts`
- Create: `os-legal-caml/LICENSE`
- Create: `os-legal-caml/.changeset/config.json`
- Create: `os-legal-caml/.gitignore`

> **Note:** The new repo should be created as a sibling directory to OpenContracts (e.g., `~/Code/os-legal-caml/`). Initialize a fresh git repo there.

- [ ] **Step 1: Create repo directory, initialize git, and set up Yarn Berry**

> **Note:** This project uses Yarn Berry (v4+) for `workspace:*` protocol support and `workspaces foreach`.

```bash
mkdir -p ~/Code/os-legal-caml && cd ~/Code/os-legal-caml && git init
corepack enable && yarn init -2
yarn plugin import workspace-tools
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "os-legal-caml",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "yarn workspaces foreach -A run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "clean": "rm -rf packages/*/dist"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 5: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 OS Legal

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Create `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 8: Install root dependencies**

```bash
cd ~/Code/os-legal-caml && yarn install
```

- [ ] **Step 9: Commit scaffold**

```bash
git add -A && git commit -m "Initialize monorepo scaffold with workspaces, vitest, and changesets"
```

---

## Task 2: Create `@os-legal/caml` Parser Package

**Files:**
- Create: `packages/caml/package.json`
- Create: `packages/caml/tsconfig.json`
- Create: `packages/caml/tsup.config.ts`
- Copy: `packages/caml/src/types.ts` ← from `frontend/src/caml/parser/types.ts`
- Copy: `packages/caml/src/tokenizer.ts` ← from `frontend/src/caml/parser/tokenizer.ts`
- Copy: `packages/caml/src/blockParsers.ts` ← from `frontend/src/caml/parser/blockParsers.ts`
- Create: `packages/caml/src/index.ts`
- Copy: `packages/caml/__tests__/parseCaml.test.ts` ← from `frontend/src/caml/parser/__tests__/parseCaml.test.ts`

- [ ] **Step 1: Create `packages/caml/package.json`**

```json
{
  "name": "@os-legal/caml",
  "version": "0.1.0",
  "type": "module",
  "description": "CAML (Corpus Article Markup Language) parser — zero-dependency markdown superset for legal articles",
  "license": "MIT",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {},
  "devDependencies": {
    "tsup": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/caml/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/caml/tsup.config.ts`**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
```

- [ ] **Step 4: Copy parser source files**

Copy these files from the OpenContracts repo to the new repo:

```bash
OC=~/Code/OpenContracts/frontend/src/caml/parser
DEST=~/Code/os-legal-caml/packages/caml

mkdir -p $DEST/src $DEST/__tests__

cp $OC/types.ts $DEST/src/types.ts
cp $OC/tokenizer.ts $DEST/src/tokenizer.ts
cp $OC/blockParsers.ts $DEST/src/blockParsers.ts
cp $OC/__tests__/parseCaml.test.ts $DEST/__tests__/parseCaml.test.ts
```

- [ ] **Step 5: Fix the one OC-specific comment in `types.ts`**

In `packages/caml/src/types.ts`, line 43, change:
```typescript
// Before:
content: string; // Raw markdown (rendered by MarkdownMessageRenderer)
// After:
content: string; // Raw markdown
```

- [ ] **Step 6: Create `packages/caml/src/index.ts`**

```typescript
export { parseCaml } from "./tokenizer";
export type {
  // Top-level document
  CamlDocument,
  CamlFrontmatter,
  CamlChapter,

  // Hero & Footer
  CamlHero,
  CamlFooter,
  CamlFooterNav,

  // Block union + individual block types
  CamlBlock,
  CamlProse,
  CamlCards,
  CamlCardItem,
  CamlPills,
  CamlPillItem,
  CamlTabs,
  CamlTab,
  CamlTabSection,
  CamlTabSource,
  CamlTimeline,
  CamlTimelineLegendItem,
  CamlTimelineItem,
  CamlCta,
  CamlCtaButton,
  CamlSignup,
  CamlCorpusStats,
  CamlCorpusStatItem,
  CamlAnnotationEmbed,
} from "./types";
```

- [ ] **Step 7: Fix test import paths**

In `packages/caml/__tests__/parseCaml.test.ts`, update both imports:

```typescript
// Before:
import { parseCaml } from "../index";
import type {
  CamlCards,
  CamlPills,
  CamlTabs,
  CamlTimeline,
  CamlCta,
  CamlSignup,
  CamlCorpusStats,
  CamlProse,
} from "../types";

// After:
import { parseCaml } from "../src/index";
import type {
  CamlCards,
  CamlPills,
  CamlTabs,
  CamlTimeline,
  CamlCta,
  CamlSignup,
  CamlCorpusStats,
  CamlProse,
} from "../src/types";
```

- [ ] **Step 8: Install dependencies and run tests**

```bash
cd ~/Code/os-legal-caml && yarn install && yarn test
```

Expected: All parser tests pass (should be ~20+ tests).

- [ ] **Step 9: Build the package**

```bash
cd ~/Code/os-legal-caml && yarn workspace @os-legal/caml build
```

Expected: `packages/caml/dist/` contains `index.mjs`, `index.cjs`, `index.d.ts`.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "Add @os-legal/caml parser package with tests"
```

---

## Task 3: Create `@os-legal/caml-react` Package Scaffold + Theme System

**Files:**
- Create: `packages/caml-react/package.json`
- Create: `packages/caml-react/tsconfig.json`
- Create: `packages/caml-react/tsup.config.ts`
- Create: `packages/caml-react/src/theme.ts`
- Create: `packages/caml-react/src/CamlThemeProvider.tsx`

- [ ] **Step 1: Create `packages/caml-react/package.json`**

```json
{
  "name": "@os-legal/caml-react",
  "version": "0.1.0",
  "type": "module",
  "description": "React renderer for CAML (Corpus Article Markup Language) articles",
  "license": "MIT",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@os-legal/caml": "workspace:*"
  },
  "peerDependencies": {
    "react": ">=17",
    "react-dom": ">=17",
    "styled-components": ">=5",
    "react-markdown": ">=8",
    "remark-gfm": ">=3",
    "rehype-sanitize": ">=5"
  },
  "peerDependenciesMeta": {
    "react-markdown": { "optional": true },
    "remark-gfm": { "optional": true },
    "rehype-sanitize": { "optional": true }
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "styled-components": "^6.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "rehype-sanitize": "^6.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/caml-react/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/caml-react/tsup.config.ts`**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "styled-components",
    "react-markdown",
    "remark-gfm",
    "rehype-sanitize",
  ],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
```

- [ ] **Step 4: Create `packages/caml-react/src/theme.ts`**

This file defines the `CamlTheme` interface, `CamlStats` type, default theme values, and internal merge utilities.

```typescript
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// CamlTheme — token interface for theming CAML articles
// ---------------------------------------------------------------------------

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
    heading: string;
    proseText: string;
    darkProse: string;
  };
  typography: {
    fontFamilySans: string;
    fontFamilySerif: string;
  };
  accentAlpha: (opacity: number) => string;
}

// ---------------------------------------------------------------------------
// CamlStats — shared stats shape for corpus-stats blocks
// ---------------------------------------------------------------------------

export interface CamlStats {
  annotations?: number;
  documents?: number;
  contributors?: number;
  threads?: number;
}

// ---------------------------------------------------------------------------
// Default theme — matches OS Legal design system values
// ---------------------------------------------------------------------------

export const defaultCamlTheme: CamlTheme = {
  colors: {
    accent: "#0f766e",
    accentHover: "#0d6860",
    textPrimary: "#1e293b",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    textMuted: "#94a3b8",
    surface: "white",
    surfaceLight: "#f1f5f9",
    surfaceHover: "#f8fafc",
    border: "#e2e8f0",
    heading: "#0f172a",
    proseText: "#334155",
    darkProse: "#cbd5e1",
  },
  typography: {
    fontFamilySans: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontFamilySerif: '"Georgia", "Times New Roman", serif',
  },
  accentAlpha: (opacity: number) => `rgba(15, 118, 110, ${opacity})`,
};

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/** Recursively make all properties optional (functions pass through as-is). */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (...args: any[]) => any
    ? T[P]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/** Shallow-merge nested objects (2 levels deep — sufficient for CamlTheme). */
export function deepMerge(
  base: CamlTheme,
  overrides?: DeepPartial<CamlTheme>
): CamlTheme {
  if (!overrides) return base;
  return {
    colors: { ...base.colors, ...overrides.colors },
    typography: { ...base.typography, ...overrides.typography },
    accentAlpha: overrides.accentAlpha ?? base.accentAlpha,
  };
}
```

- [ ] **Step 5: Create `packages/caml-react/src/CamlThemeProvider.tsx`**

```tsx
import React, { createContext, useContext, type ReactNode } from "react";
import { ThemeProvider } from "styled-components";

import {
  type CamlTheme,
  type DeepPartial,
  defaultCamlTheme,
  deepMerge,
} from "./theme";

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
      <ThemeProvider theme={(outerTheme) => ({ ...outerTheme, caml: merged })}>
        {children}
      </ThemeProvider>
    </CamlThemeContext.Provider>
  );
}
```

- [ ] **Step 6: Install dependencies**

```bash
cd ~/Code/os-legal-caml && yarn install
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd ~/Code/os-legal-caml && yarn workspace @os-legal/caml-react tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add @os-legal/caml-react scaffold with theme system"
```

---

## Task 4: Create Default Markdown Renderer

**Files:**
- Create: `packages/caml-react/src/CamlMarkdown.tsx`

- [ ] **Step 1: Create `packages/caml-react/src/CamlMarkdown.tsx`**

```tsx
import React from "react";
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd ~/Code/os-legal-caml && yarn workspace @os-legal/caml-react tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add CamlMarkdown default renderer"
```

---

## Task 5: Lift and Refactor `styles.ts`

This is the largest mechanical task — replacing ~104 direct `OS_LEGAL_COLORS`/`OS_LEGAL_TYPOGRAPHY`/`accentAlpha`/`CAML_*` references with styled-components theme reads.

**Files:**
- Copy + modify: `packages/caml-react/src/styles.ts` ← from `frontend/src/caml/renderer/styles.ts`

- [ ] **Step 1: Copy `styles.ts` to the new repo**

```bash
cp ~/Code/OpenContracts/frontend/src/caml/renderer/styles.ts \
   ~/Code/os-legal-caml/packages/caml-react/src/styles.ts
```

- [ ] **Step 2: Remove the OC import block**

Replace the imports at the top of the file:

```typescript
// REMOVE these lines:
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_TYPOGRAPHY,
  accentAlpha,
} from "../../assets/configurations/osLegalStyles";
```

Remove the CAML-specific color constant declarations too (they'll come from the theme):

```typescript
// REMOVE these lines (the values are now in defaultCamlTheme):
const CAML_HEADING = "#0f172a";
const CAML_PROSE_TEXT = "#334155";
const CAML_DARK_PROSE = "#cbd5e1";
```

- [ ] **Step 3: Add a typed theme interface for styled-components**

Add at the top of `styles.ts` (after the `styled` import):

```typescript
import type { CamlTheme } from "./theme";

// Augment styled-components default theme to include caml namespace
declare module "styled-components" {
  export interface DefaultTheme {
    caml: CamlTheme;
  }
}
```

- [ ] **Step 4: Perform the mechanical replacements**

Apply these find-and-replace patterns across the entire file:

| Find | Replace |
|------|---------|
| `${OS_LEGAL_COLORS.accent}` | `${({ theme }) => theme.caml.colors.accent}` |
| `${OS_LEGAL_COLORS.accentHover}` | `${({ theme }) => theme.caml.colors.accentHover}` |
| `${OS_LEGAL_COLORS.textPrimary}` | `${({ theme }) => theme.caml.colors.textPrimary}` |
| `${OS_LEGAL_COLORS.textSecondary}` | `${({ theme }) => theme.caml.colors.textSecondary}` |
| `${OS_LEGAL_COLORS.textTertiary}` | `${({ theme }) => theme.caml.colors.textTertiary}` |
| `${OS_LEGAL_COLORS.textMuted}` | `${({ theme }) => theme.caml.colors.textMuted}` |
| `${OS_LEGAL_COLORS.surface}` | `${({ theme }) => theme.caml.colors.surface}` |
| `${OS_LEGAL_COLORS.surfaceLight}` | `${({ theme }) => theme.caml.colors.surfaceLight}` |
| `${OS_LEGAL_COLORS.surfaceHover}` | `${({ theme }) => theme.caml.colors.surfaceHover}` |
| `${OS_LEGAL_COLORS.border}` | `${({ theme }) => theme.caml.colors.border}` |
| `${OS_LEGAL_TYPOGRAPHY.fontFamilySans}` | `${({ theme }) => theme.caml.typography.fontFamilySans}` |
| `${OS_LEGAL_TYPOGRAPHY.fontFamilySerif}` | `${({ theme }) => theme.caml.typography.fontFamilySerif}` |
| `${accentAlpha(` | `${({ theme }) => theme.caml.accentAlpha(` |
| `${CAML_HEADING}` | `${({ theme }) => theme.caml.colors.heading}` |
| `${CAML_PROSE_TEXT}` | `${({ theme }) => theme.caml.colors.proseText}` |
| `${CAML_DARK_PROSE}` | `${({ theme }) => theme.caml.colors.darkProse}` |

**WARNING:** The table above only works for standalone usages. There are ~20+ cases where tokens appear inside existing interpolation functions that already destructure props (e.g., `$color`, `$dark`, `$primary`, `$active`). For those, add `theme` to the existing destructuring instead of wrapping in a new function. This applies to `accentAlpha` calls too — 3 of the 4 `accentAlpha` usages are inside existing interpolation functions. Examples:

```typescript
// Before:
color: ${({ $dark }) =>
  $dark ? OS_LEGAL_COLORS.textMuted : OS_LEGAL_COLORS.textSecondary};

// After:
color: ${({ $dark, theme }) =>
  $dark ? theme.caml.colors.textMuted : theme.caml.colors.textSecondary};
```

Similarly for `accentAlpha` inside existing interpolations:

```typescript
// Before:
background: ${({ $color }) => $color ? `${$color}08` : accentAlpha(0.04)};

// After:
background: ${({ $color, theme }) => $color ? `${$color}08` : theme.caml.accentAlpha(0.04)};
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd ~/Code/os-legal-caml && yarn workspace @os-legal/caml-react tsc --noEmit
```

Fix any type errors. Common issues:
- Missing `theme` destructuring in prop functions that already destructure other props
- Incorrect closing parentheses after adding `theme` parameter

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Lift styles.ts with theme-based token references"
```

---

## Task 6: Lift Renderer Components

**Files:**
- Copy: `packages/caml-react/src/safeHref.ts` ← from `frontend/src/caml/renderer/safeHref.ts`
- Copy: `packages/caml-react/src/CamlHero.tsx` ← from `frontend/src/caml/renderer/CamlHero.tsx`
- Copy: `packages/caml-react/src/CamlFooter.tsx` ← from `frontend/src/caml/renderer/CamlFooter.tsx`
- Copy + modify: `packages/caml-react/src/CamlBlocks.tsx` ← from `frontend/src/caml/renderer/CamlBlocks.tsx`
- Copy + modify: `packages/caml-react/src/CamlChapter.tsx` ← from `frontend/src/caml/renderer/CamlChapter.tsx`
- Copy + modify: `packages/caml-react/src/CamlArticle.tsx` ← from `frontend/src/caml/renderer/CamlArticle.tsx`
- Copy: `packages/caml-react/__tests__/safeHref.test.ts` ← from `frontend/src/caml/renderer/__tests__/safeHref.test.ts`

- [ ] **Step 1: Copy files that need no logic changes**

```bash
SRC=~/Code/OpenContracts/frontend/src/caml/renderer
DEST=~/Code/os-legal-caml/packages/caml-react

cp $SRC/safeHref.ts $DEST/src/safeHref.ts
cp $SRC/CamlHero.tsx $DEST/src/CamlHero.tsx
cp $SRC/CamlFooter.tsx $DEST/src/CamlFooter.tsx

mkdir -p $DEST/__tests__
cp $SRC/__tests__/safeHref.test.ts $DEST/__tests__/safeHref.test.ts
```

- [ ] **Step 2: Fix import paths in CamlHero.tsx**

```typescript
// Before:
import type { CamlHero } from "../parser/types";
// After:
import type { CamlHero } from "@os-legal/caml";
```

Styles import stays the same (relative `./styles`).

- [ ] **Step 3: Fix import paths in CamlFooter.tsx**

```typescript
// Before:
import type { CamlFooter } from "../parser/types";
// After:
import type { CamlFooter } from "@os-legal/caml";
```

- [ ] **Step 4: Copy and modify CamlBlocks.tsx**

```bash
cp $SRC/CamlBlocks.tsx $DEST/src/CamlBlocks.tsx
```

Changes needed in `CamlBlocks.tsx`:

**a) Fix type imports:**
```typescript
// Before:
import type { CamlBlock, CamlCards, ... } from "../parser/types";
// After:
import type { CamlBlock, CamlCards, ... } from "@os-legal/caml";
```

**b) Replace MarkdownMessageRenderer import with CamlMarkdown + render prop:**
```typescript
// REMOVE:
import { MarkdownMessageRenderer } from "../../components/threads/MarkdownMessageRenderer";

// ADD:
import { CamlMarkdown } from "./CamlMarkdown";
import type { CamlStats } from "./theme";
import type { ReactNode } from "react";
```

**c) Update `BlockRendererProps` interface:**
```typescript
interface BlockRendererProps {
  block: CamlBlock;
  dark?: boolean;
  stats?: CamlStats;
  renderMarkdown?: (content: string) => ReactNode;
  renderAnnotationEmbed?: (ref: string) => ReactNode;
}
```

**d) Update `CamlBlockRenderer` to thread props:**
```typescript
export const CamlBlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  dark,
  stats,
  renderMarkdown,
  renderAnnotationEmbed,
}) => {
  switch (block.type) {
    case "prose":
      return <ProseBlock block={block} dark={dark} renderMarkdown={renderMarkdown} />;
    case "tabs":
      return <TabsBlock block={block} renderMarkdown={renderMarkdown} />;
    case "annotation-embed":
      return renderAnnotationEmbed ? (
        renderAnnotationEmbed(block.ref)
      ) : (
        <ProseContainer>
          <em>Annotation embed (coming soon)</em>
        </ProseContainer>
      );
    // ... other cases unchanged
    case "cards":
      return <CardsBlock block={block} />;
    case "pills":
      return <PillsBlock block={block} />;
    case "timeline":
      return <TimelineBlock block={block} />;
    case "cta":
      return <CtaBlock block={block} />;
    case "signup":
      return <SignupBlock block={block} />;
    case "corpus-stats":
      return <CorpusStatsBlock block={block} stats={stats} />;
    default:
      return null;
  }
};
```

**e) Update `ProseBlock` to accept `renderMarkdown`:**
```typescript
function ProseBlock({
  block,
  dark,
  renderMarkdown,
}: {
  block: CamlProse;
  dark?: boolean;
  renderMarkdown?: (content: string) => ReactNode;
}) {
  const segments = splitPullquotes(block.content);
  const renderMd = (content: string) =>
    renderMarkdown ? renderMarkdown(content) : <CamlMarkdown content={content} />;

  return (
    <ProseContainer $dark={dark}>
      {segments.map((seg, i) => {
        if (seg.type === "pullquote") {
          return <Pullquote key={i}>{seg.text}</Pullquote>;
        }
        return <React.Fragment key={i}>{renderMd(seg.text)}</React.Fragment>;
      })}
    </ProseContainer>
  );
}
```

**f) Update `TabsBlock` to accept `renderMarkdown`:**
```typescript
function TabsBlock({
  block,
  renderMarkdown,
}: {
  block: CamlTabs;
  renderMarkdown?: (content: string) => ReactNode;
}) {
  // ... existing state logic unchanged ...
  const renderMd = (content: string) =>
    renderMarkdown ? renderMarkdown(content) : <CamlMarkdown content={content} />;

  // In the JSX, replace:
  //   <MarkdownMessageRenderer content={section.content} />
  // With:
  //   {renderMd(section.content)}
}
```

- [ ] **Step 5: Copy and modify CamlChapter.tsx**

```bash
cp $SRC/CamlChapter.tsx $DEST/src/CamlChapter.tsx
```

Changes:
```typescript
// Before:
import type { CamlChapter, CamlBlock } from "../parser/types";
// After:
import type { CamlChapter, CamlBlock } from "@os-legal/caml";
import type { CamlStats } from "./theme";
import type { ReactNode } from "react";

export interface CamlChapterRendererProps {
  chapter: CamlChapter;
  stats?: CamlStats;
  renderMarkdown?: (content: string) => ReactNode;
  renderAnnotationEmbed?: (ref: string) => ReactNode;
}

// Thread props to CamlBlockRenderer:
<CamlBlockRenderer
  key={index}
  block={block}
  dark={isDark}
  stats={stats}
  renderMarkdown={renderMarkdown}
  renderAnnotationEmbed={renderAnnotationEmbed}
/>
```

- [ ] **Step 6: Copy and modify CamlArticle.tsx**

```bash
cp $SRC/CamlArticle.tsx $DEST/src/CamlArticle.tsx
```

Changes:
```typescript
// Before:
import type { CamlDocument } from "../parser/types";
// After:
import type { CamlDocument } from "@os-legal/caml";
import type { CamlStats } from "./theme";
import type { ReactNode } from "react";

export interface CamlArticleProps {
  document: CamlDocument;
  stats?: CamlStats;
  renderMarkdown?: (content: string) => ReactNode;
  renderAnnotationEmbed?: (ref: string) => ReactNode;
}

// Thread props to CamlChapterRenderer:
<CamlChapterRenderer
  key={chapter.id}
  chapter={chapter}
  stats={stats}
  renderMarkdown={renderMarkdown}
  renderAnnotationEmbed={renderAnnotationEmbed}
/>
```

- [ ] **Step 7: Fix test import path in safeHref.test.ts**

```typescript
// Before:
import { isSafeHref, isExternalHref } from "../safeHref";
// After:
import { isSafeHref, isExternalHref } from "../src/safeHref";
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd ~/Code/os-legal-caml && yarn workspace @os-legal/caml-react tsc --noEmit
```

- [ ] **Step 9: Run tests**

```bash
cd ~/Code/os-legal-caml && yarn test
```

Expected: All parser tests + safeHref tests pass.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "Lift renderer components with render slot props"
```

---

## Task 7: Create Public API Barrel + Build

**Files:**
- Create: `packages/caml-react/src/index.ts`

- [ ] **Step 1: Create `packages/caml-react/src/index.ts`**

```typescript
// Components
export { CamlArticle } from "./CamlArticle";
export type { CamlArticleProps } from "./CamlArticle";
export { CamlThemeProvider, useCamlTheme } from "./CamlThemeProvider";
export { CamlMarkdown } from "./CamlMarkdown";

// Theme
export { defaultCamlTheme } from "./theme";
export type { CamlTheme, CamlStats } from "./theme";

// Types re-exported from @os-legal/caml for convenience
export type { CamlDocument } from "@os-legal/caml";
```

- [ ] **Step 2: Build both packages**

```bash
cd ~/Code/os-legal-caml && yarn build
```

Expected: Both `packages/caml/dist/` and `packages/caml-react/dist/` contain `.mjs`, `.cjs`, and `.d.ts` files.

- [ ] **Step 3: Run all tests one final time**

```bash
cd ~/Code/os-legal-caml && yarn test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Add public API barrel and verify full build"
```

---

## Task 8: Update OpenContracts to Consume Library

> **Note:** This task happens in the OpenContracts repo, not the new library repo. During development, use `link:` protocol to point to the local library. After the library is published to npm, switch to versioned dependencies.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/components/corpuses/CamlArticleEditor.tsx`
- Modify: `frontend/src/components/corpuses/CorpusHome/CorpusArticleView.tsx`
- Delete: `frontend/src/caml/` (entire directory)

- [ ] **Step 1: Add library dependencies to OC**

In `frontend/package.json`, add:

```json
{
  "dependencies": {
    "@os-legal/caml": "link:../../os-legal-caml/packages/caml",
    "@os-legal/caml-react": "link:../../os-legal-caml/packages/caml-react"
  }
}
```

Then:
```bash
cd ~/Code/OpenContracts/frontend && yarn install
```

- [ ] **Step 2: Update `CamlArticleEditor.tsx`**

Replace the CAML import:

```typescript
// Before (line 28):
import { parseCaml, CamlArticle } from "../../caml";

// After:
import { parseCaml } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";
import { MarkdownMessageRenderer } from "../threads/MarkdownMessageRenderer";
```

Wrap the `<CamlArticle>` usage in `CamlThemeProvider` and pass `renderMarkdown` (line 396):

```tsx
// Before:
{parsedDocument && <CamlArticle document={parsedDocument} />}

// After:
{parsedDocument && (
  <CamlThemeProvider>
    <CamlArticle
      document={parsedDocument}
      renderMarkdown={(md) => <MarkdownMessageRenderer content={md} />}
    />
  </CamlThemeProvider>
)}
```

- [ ] **Step 3: Update `CorpusArticleView.tsx`**

Replace the CAML imports:

```typescript
// Before (lines 21-22):
import { parseCaml, CamlArticle } from "../../../caml";
import type { CamlDocument } from "../../../caml";

// After:
import { parseCaml } from "@os-legal/caml";
import type { CamlDocument } from "@os-legal/caml";
import { CamlArticle, CamlThemeProvider } from "@os-legal/caml-react";
import { MarkdownMessageRenderer } from "../../threads/MarkdownMessageRenderer";
```

Wrap the `<CamlArticle>` usage and pass `renderMarkdown` (line 258):

```tsx
// Before:
<CamlArticle document={parsedDocument} stats={stats} />

// After:
<CamlThemeProvider>
  <CamlArticle
    document={parsedDocument}
    stats={stats}
    renderMarkdown={(md) => <MarkdownMessageRenderer content={md} />}
  />
</CamlThemeProvider>
```

- [ ] **Step 4: Delete the `frontend/src/caml/` directory**

```bash
rm -rf ~/Code/OpenContracts/frontend/src/caml
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd ~/Code/OpenContracts/frontend && yarn tsc --noEmit
```

Fix any remaining import issues. Common things to check:
- No remaining imports from `../../caml` or `../../../caml`
- The `CamlArticle` component props still match (now requires wrapping in `CamlThemeProvider`)

- [ ] **Step 6: Verify the frontend builds**

```bash
cd ~/Code/OpenContracts/frontend && yarn build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Run pre-commit hooks**

```bash
cd ~/Code/OpenContracts && pre-commit run --all-files
```

- [ ] **Step 8: Commit**

```bash
cd ~/Code/OpenContracts
git add frontend/src/components/corpuses/CamlArticleEditor.tsx \
       frontend/src/components/corpuses/CorpusHome/CorpusArticleView.tsx \
       frontend/package.json frontend/yarn.lock
git rm -r frontend/src/caml
git commit -m "Switch to @os-legal/caml and @os-legal/caml-react packages"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run OC frontend unit tests**

```bash
cd ~/Code/OpenContracts/frontend && yarn test:unit
```

Expected: No CAML-related test failures (the tests now live in the library repo).

- [ ] **Step 2: Run library tests**

```bash
cd ~/Code/os-legal-caml && yarn test
```

Expected: All tests pass.

- [ ] **Step 3: Verify library build outputs are clean**

```bash
cd ~/Code/os-legal-caml && yarn build && ls -la packages/caml/dist/ && ls -la packages/caml-react/dist/
```

Expected: Each dist/ has `index.mjs`, `index.cjs`, `index.d.ts` (plus `.d.mts`).
