# Pipeline Component Management Redesign

## Problem

The current Pipeline Configuration UI conflates two distinct concepts:

1. **Component management** — configuring individual pipeline components (settings, secrets, enabling/disabling)
2. **Filetype default assignment** — choosing which component handles each MIME type for each pipeline stage

These are presented as a single stage-centric flow (Parsers → Embedders → Thumbnailers) with MIME type filter buttons, making it hard to independently manage components vs. assign them.

## Decision: Approach A — Extend PipelineSettings with `enabled_components`

Add a single new JSON field to the existing `PipelineSettings` singleton rather than creating new models. This minimizes migration effort while achieving clean separation.

## Design

### Backend

**New field on `PipelineSettings`**:

```python
enabled_components = models.JSONField(
    default=list,
    blank=True,
    help_text="List of enabled component class paths"
)
```

**Semantics**:
- Empty list = all components enabled (backward compat)
- Non-empty list = only listed components available for filetype assignment
- Convenience method: `PipelineSettings.is_component_enabled(class_path) -> bool`

**Migration**: Auto-populate from the union of all components currently in `preferred_parsers`, `preferred_embedders`, `preferred_thumbnailers`, and `default_embedder`.

**Mutation changes**:
- `UpdatePipelineSettingsMutation` gains `enabled_components` input
- Validates each path exists in the registry
- Validates assigned components (in `preferred_*` fields) must be enabled — cannot disable a currently-assigned component without removing the assignment first (or both in one mutation)

**GraphQL type changes**:
- `PipelineComponentType` gains `enabled: Boolean` resolved from `enabled_components` list
- `pipeline_components` query for non-superusers continues filtering to enabled+assigned components only

### Frontend — Single Tab, Two Sections

Both sections live under the existing "Pipeline Configuration" tab.

#### Section 1: Pipeline Components (Component Library)

- **Filter bar**: chips for All / Parsers / Embedders / Thumbnailers / Post-Processors + search input
- **Flat list of component cards**, each showing:
  - Enable/disable toggle (left)
  - Component name + description (from registry)
  - Stage badge + supported file types badges
  - Expandable settings panel (existing `AdvancedSettingsPanel`)
- Disabled components are visually muted but still visible and configurable
- Toggling off an assigned component shows confirmation, then removes both the enable state and the filetype assignment in one mutation

#### Section 2: Filetype Defaults

- **One row per MIME type** (PDF, TXT, DOCX), each showing:
  - Filetype label + icon
  - Three dropdowns: Parser, Embedder, Thumbnailer
  - Each dropdown populated with enabled components of matching stage that support that file type
- **Default Embedder** selector (global fallback) shown separately
- Dropdowns show "None available" when no enabled component supports the combination
- Warning state when a filetype has no assignment for a stage

### What Changes

**Deleted**:
- Stage-centric layout with MIME type filter buttons and component grids
- `FlowParticles.tsx` (already removed in PR #1032)

**Refactored**:
- `SystemSettings.tsx` → two-section layout
- `PipelineStageSection.tsx` → replaced with new ComponentLibrary + FiletypeDefaults components
- `styles.ts` → updated for new layout

**Unchanged**:
- Pipeline execution logic (still reads `preferred_*` fields)
- Corpus-level embedder override
- Secrets encryption
- Component registry / auto-discovery
- `AdvancedSettingsPanel` (re-parented under component cards)

### Scope Boundaries

- Per-corpus assignment stays embedder-only (no expansion)
- No new database tables
- No changes to pipeline execution path
