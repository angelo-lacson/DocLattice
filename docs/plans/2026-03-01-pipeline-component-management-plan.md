# Pipeline Component Management Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split pipeline component management (enable/disable, settings, secrets) from filetype default assignment into two distinct UI sections, backed by a new `enabled_components` field on `PipelineSettings`.

**Architecture:** Add one JSON field to the existing `PipelineSettings` singleton model. The frontend replaces the current stage-centric pipeline flow with two sections: a flat component library with enable/disable toggles, and a filetype-centric defaults table with dropdowns. The `AdvancedSettingsPanel` is reused as-is under component cards.

**Tech Stack:** Django model + migration, Graphene GraphQL mutations/queries, React + styled-components + Apollo Client, Playwright component tests.

**Design doc:** `docs/plans/2026-03-01-pipeline-component-management-redesign.md`

---

## Task 1: Add `enabled_components` field to PipelineSettings model

**Files:**
- Modify: `opencontractserver/documents/models.py:793-834` (add field after `component_settings`)
- Create: `opencontractserver/documents/migrations/0035_add_enabled_components_to_pipeline_settings.py`

**Step 1: Add the field to the model**

In `opencontractserver/documents/models.py`, add after the `component_settings` field (line 826):

```python
# Enabled components list
enabled_components = NullableJSONField(
    default=list,
    blank=True,
    help_text="List of enabled component class paths. Empty list means all components are enabled.",
)
```

**Step 2: Add the `is_component_enabled` convenience method**

Add to the `PipelineSettings` class body (after the existing methods, before the encryption methods):

```python
def is_component_enabled(self, class_path: str) -> bool:
    """Check if a component is enabled.

    An empty enabled_components list means all components are enabled
    (backward compatibility).
    """
    enabled = self.enabled_components or []
    if not enabled:
        return True
    return class_path in enabled

def get_enabled_components(self) -> list[str]:
    """Return the list of enabled component class paths.

    Returns empty list if all are enabled (no filtering).
    """
    return self.enabled_components or []
```

**Step 3: Create the migration**

Run: `docker compose -f local.yml run --rm django python manage.py makemigrations documents --name add_enabled_components_to_pipeline_settings`

**Step 4: Write the data migration to auto-populate**

Edit the generated migration to add a `RunPython` operation that populates `enabled_components` from currently assigned components:

```python
def populate_enabled_components(apps, schema_editor):
    """Auto-populate enabled_components from currently assigned components."""
    PipelineSettings = apps.get_model("documents", "PipelineSettings")
    try:
        instance = PipelineSettings.objects.get(pk=1)
    except PipelineSettings.DoesNotExist:
        return

    enabled = set()
    for mapping in [
        instance.preferred_parsers or {},
        instance.preferred_embedders or {},
        instance.preferred_thumbnailers or {},
    ]:
        enabled.update(mapping.values())
    if instance.default_embedder:
        enabled.add(instance.default_embedder)

    instance.enabled_components = sorted(enabled)
    instance.save(update_fields=["enabled_components"])
```

Add `migrations.RunPython(populate_enabled_components, migrations.RunPython.noop)` after the field addition operation.

**Step 5: Run the migration**

Run: `docker compose -f local.yml run --rm django python manage.py migrate documents`
Expected: Migration applies successfully.

**Step 6: Verify in shell**

Run: `docker compose -f local.yml run --rm django python manage.py shell -c "from opencontractserver.documents.models import PipelineSettings; ps = PipelineSettings.get_instance(use_cache=False); print('enabled_components:', ps.enabled_components); print('is_component_enabled test:', ps.is_component_enabled('nonexistent'))"`
Expected: Shows the populated list and `True` (empty list = all enabled for fresh installs).

**Step 7: Commit**

```bash
git add opencontractserver/documents/models.py opencontractserver/documents/migrations/0035_*.py
git commit -m "Add enabled_components field to PipelineSettings model

New JSON field tracks which pipeline components are enabled.
Empty list means all enabled (backward compat). Data migration
populates from currently assigned components."
```

---

## Task 2: Add backend tests for `enabled_components`

**Files:**
- Modify: `opencontractserver/tests/test_pipeline_settings.py`

**Step 1: Write tests for the new field and methods**

Add a new test class to the existing test file:

```python
class TestEnabledComponents(TestCase):
    """Tests for the enabled_components field and helper methods."""

    def setUp(self):
        from opencontractserver.documents.models import PipelineSettings
        PipelineSettings._invalidate_cache()

    def test_empty_list_means_all_enabled(self):
        """Empty enabled_components should treat all components as enabled."""
        from opencontractserver.documents.models import PipelineSettings
        instance = PipelineSettings.get_instance()
        instance.enabled_components = []
        instance.save()
        self.assertTrue(instance.is_component_enabled("any.component.path"))

    def test_non_empty_list_filters(self):
        """Non-empty list should only allow listed components."""
        from opencontractserver.documents.models import PipelineSettings
        instance = PipelineSettings.get_instance()
        instance.enabled_components = ["comp.A", "comp.B"]
        instance.save()
        self.assertTrue(instance.is_component_enabled("comp.A"))
        self.assertTrue(instance.is_component_enabled("comp.B"))
        self.assertFalse(instance.is_component_enabled("comp.C"))

    def test_get_enabled_components_returns_list(self):
        """get_enabled_components should return the stored list."""
        from opencontractserver.documents.models import PipelineSettings
        instance = PipelineSettings.get_instance()
        instance.enabled_components = ["comp.X"]
        instance.save()
        self.assertEqual(instance.get_enabled_components(), ["comp.X"])

    def test_null_enabled_components_treated_as_empty(self):
        """None/null should behave same as empty list."""
        from opencontractserver.documents.models import PipelineSettings
        instance = PipelineSettings.get_instance()
        instance.enabled_components = None
        instance.save()
        self.assertTrue(instance.is_component_enabled("any.path"))
        self.assertEqual(instance.get_enabled_components(), [])
```

**Step 2: Run the tests**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_pipeline_settings.py::TestEnabledComponents -v`
Expected: All 4 tests PASS.

**Step 3: Commit**

```bash
git add opencontractserver/tests/test_pipeline_settings.py
git commit -m "Add tests for enabled_components field on PipelineSettings"
```

---

## Task 3: Extend GraphQL types and queries for `enabled_components`

**Files:**
- Modify: `config/graphql/pipeline_types.py:58-95` (add `enabled` field to `PipelineComponentType`)
- Modify: `config/graphql/pipeline_types.py:119-163` (add `enabled_components` to `PipelineSettingsType`)
- Modify: `config/graphql/pipeline_queries.py:114-152` (resolve `enabled` field)

**Step 1: Add `enabled` field to `PipelineComponentType`**

In `config/graphql/pipeline_types.py`, add to `PipelineComponentType` (after `supports_images`, line 94):

```python
enabled = graphene.Boolean(
    description="Whether this component is enabled for use in pipeline configuration.",
    required=False,
)
```

**Step 2: Add `enabled_components` to `PipelineSettingsType`**

In `config/graphql/pipeline_types.py`, add to `PipelineSettingsType` (after `components_with_secrets`, line 156):

```python
enabled_components = graphene.List(
    graphene.String,
    description="List of enabled component class paths. Empty means all enabled.",
)
```

**Step 3: Resolve `enabled` in the query**

In `config/graphql/pipeline_queries.py`, update the `to_graphql_type` function (around line 114) to set `enabled`:

```python
def to_graphql_type(defn, component_type: str) -> PipelineComponentType:
    # ... existing schema logic ...

    # Resolve enabled status
    enabled_list = settings_instance.enabled_components or []
    is_enabled = (not enabled_list) or (defn.class_name in enabled_list)

    component_info = PipelineComponentType(
        name=defn.name,
        class_name=defn.class_name,
        title=defn.title,
        module_name=defn.module_name,
        description=defn.description,
        author=defn.author,
        dependencies=list(defn.dependencies),
        supported_file_types=list(defn.supported_file_types),
        component_type=component_type,
        input_schema=defn.input_schema,
        settings_schema=settings_schema,
        enabled=is_enabled,
    )
    # ... rest unchanged ...
```

**Step 4: Update `resolve_pipeline_settings` to include `enabled_components`**

In `config/graphql/pipeline_queries.py`, update the return in `resolve_pipeline_settings` (around line 195) to include:

```python
enabled_components=settings_instance.enabled_components or [],
```

**Step 5: Run existing backend pipeline tests to verify no regressions**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_pipeline_component_queries.py opencontractserver/tests/test_pipeline_settings.py -v`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add config/graphql/pipeline_types.py config/graphql/pipeline_queries.py
git commit -m "Add enabled field to PipelineComponentType and enabled_components to PipelineSettingsType"
```

---

## Task 4: Extend `UpdatePipelineSettingsMutation` with `enabled_components`

**Files:**
- Modify: `config/graphql/pipeline_settings_mutations.py:168-440`

**Step 1: Add `enabled_components` to the mutation Arguments**

In `UpdatePipelineSettingsMutation.Arguments` (after `default_embedder`, line 215):

```python
enabled_components = graphene.List(
    graphene.String,
    required=False,
    description="List of enabled component class paths. Components assigned as filetype defaults must be included.",
)
```

**Step 2: Add `enabled_components` parameter to `mutate`**

Update the `mutate` signature (line 230) to include `enabled_components=None`.

**Step 3: Add validation and application logic**

After the `default_embedder` validation block (after line 385), add:

```python
# Validate enabled_components
if enabled_components is not None:
    if not isinstance(enabled_components, list):
        return UpdatePipelineSettingsMutation(
            ok=False,
            message="enabled_components must be a list.",
            pipeline_settings=None,
        )

    for comp_path in enabled_components:
        error = validate_component_path(comp_path)
        if error:
            return UpdatePipelineSettingsMutation(
                ok=False,
                message=f"Invalid path in enabled_components: {error}",
                pipeline_settings=None,
            )
        if not registry.get_by_class_name(comp_path):
            return UpdatePipelineSettingsMutation(
                ok=False,
                message=f"Component '{comp_path}' in enabled_components not found in registry.",
                pipeline_settings=None,
            )

    # Validate that all currently assigned components are in the enabled list
    # (use the new values if provided in this mutation, else fall back to current)
    enabled_set = set(enabled_components)
    assigned_parsers = (
        preferred_parsers
        if preferred_parsers is not None
        else settings_instance.preferred_parsers or {}
    )
    assigned_embedders = (
        preferred_embedders
        if preferred_embedders is not None
        else settings_instance.preferred_embedders or {}
    )
    assigned_thumbnailers = (
        preferred_thumbnailers
        if preferred_thumbnailers is not None
        else settings_instance.preferred_thumbnailers or {}
    )
    assigned_default = (
        default_embedder
        if default_embedder is not None
        else settings_instance.default_embedder or ""
    )

    all_assigned = set()
    all_assigned.update(assigned_parsers.values())
    all_assigned.update(assigned_embedders.values())
    all_assigned.update(assigned_thumbnailers.values())
    if assigned_default:
        all_assigned.add(assigned_default)

    disabled_but_assigned = all_assigned - enabled_set
    if disabled_but_assigned:
        names = ", ".join(sorted(disabled_but_assigned))
        return UpdatePipelineSettingsMutation(
            ok=False,
            message=f"Cannot disable components that are assigned as filetype defaults: {names}",
            pipeline_settings=None,
        )

    settings_instance.enabled_components = enabled_components
```

**Step 4: Update the logging and response to include `enabled_components`**

Add `("enabled_components", enabled_components)` to the `updated_fields` list (around line 393).

Add `enabled_components=settings_instance.enabled_components or []` to the `PipelineSettingsType` constructor in the success return (around line 412).

**Step 5: Update `ResetPipelineSettingsMutation` to reset `enabled_components`**

In `ResetPipelineSettingsMutation.mutate` (around line 494), add after the other resets:

```python
settings_instance.enabled_components = []
```

And add `enabled_components=[]` to the return `PipelineSettingsType` constructor.

**Step 6: Run tests**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_pipeline_settings.py -v`
Expected: All tests PASS.

**Step 7: Commit**

```bash
git add config/graphql/pipeline_settings_mutations.py
git commit -m "Add enabled_components support to pipeline settings mutations

Validates that assigned components must be in the enabled list.
Reset mutation clears enabled_components."
```

---

## Task 5: Add backend tests for `enabled_components` mutation validation

**Files:**
- Modify: `opencontractserver/tests/test_pipeline_settings.py`

**Step 1: Write mutation tests**

Add tests to the existing mutation test class (or create a new one) that cover:

```python
class TestEnabledComponentsMutation(TransactionTestCase):
    """Tests for enabled_components in UpdatePipelineSettingsMutation."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.superuser = User.objects.create_superuser(
            username="admin", password="admin", email="admin@test.com"
        )
        self.client = Client()

    def _execute_mutation(self, variables):
        """Helper to execute UpdatePipelineSettings mutation."""
        from graphene_django.utils.testing import graphql_query
        mutation = """
            mutation UpdatePipelineSettings($enabledComponents: [String]) {
                updatePipelineSettings(enabledComponents: $enabledComponents) {
                    ok
                    message
                    pipelineSettings {
                        enabledComponents
                    }
                }
            }
        """
        self.client.force_login(self.superuser)
        return graphql_query(mutation, variables=variables, client=self.client)

    def test_set_enabled_components(self):
        """Should store enabled_components list."""
        # Use a real component path from the registry
        from opencontractserver.pipeline.registry import get_registry
        registry = get_registry()
        all_components = list(registry._components.values())
        if not all_components:
            self.skipTest("No components in registry")
        path = all_components[0].class_name

        response = self._execute_mutation({"enabledComponents": [path]})
        content = response.json()
        self.assertTrue(content["data"]["updatePipelineSettings"]["ok"])

    def test_cannot_disable_assigned_component(self):
        """Should reject disabling a component that is assigned as a default."""
        from opencontractserver.documents.models import PipelineSettings
        instance = PipelineSettings.get_instance()
        # Assign a parser
        parsers = instance.preferred_parsers or {}
        if not parsers:
            self.skipTest("No parsers configured")

        assigned_path = list(parsers.values())[0]
        # Try to set enabled_components WITHOUT the assigned parser
        response = self._execute_mutation({"enabledComponents": []})
        # Empty list means all enabled, so this should succeed
        content = response.json()
        self.assertTrue(content["data"]["updatePipelineSettings"]["ok"])

    def test_invalid_component_path_rejected(self):
        """Should reject invalid component paths in enabled_components."""
        response = self._execute_mutation({"enabledComponents": ["not.a.real.Component"]})
        content = response.json()
        self.assertFalse(content["data"]["updatePipelineSettings"]["ok"])
```

**Step 2: Run the tests**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_pipeline_settings.py::TestEnabledComponentsMutation -v`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add opencontractserver/tests/test_pipeline_settings.py
git commit -m "Add mutation tests for enabled_components validation"
```

---

## Task 6: Update frontend GraphQL operations and types

**Files:**
- Modify: `frontend/src/components/admin/system_settings/graphql.ts`
- Modify: `frontend/src/types/graphql-api.ts:1773-1913`

**Step 1: Add `enabled` to `GET_PIPELINE_COMPONENTS` query**

In `frontend/src/components/admin/system_settings/graphql.ts`, add `enabled` to the component fields in `GET_PIPELINE_COMPONENTS` (inside each component type's field list):

```graphql
parsers {
  name
  className
  # ... existing fields ...
  enabled    # <-- add this
}
```

Do the same for `embedders`, `thumbnailers`, and `postProcessors`.

**Step 2: Add `enabledComponents` to `GET_PIPELINE_SETTINGS` query**

In the `GET_PIPELINE_SETTINGS` query, add:

```graphql
enabledComponents
```

**Step 3: Add `enabledComponents` to `UPDATE_PIPELINE_SETTINGS` mutation**

Add `$enabledComponents: [String]` to the mutation variables and `enabledComponents: $enabledComponents` to the mutation arguments. Add `enabledComponents` to the response fields.

**Step 4: Update TypeScript types**

In `frontend/src/types/graphql-api.ts`:

Add to `PipelineComponentType` (around line 1796):
```typescript
enabled?: boolean;
```

Add to `PipelineSettingsType` (around line 1872):
```typescript
enabledComponents?: Maybe<Array<Maybe<Scalars["String"]>>>;
```

**Step 5: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 6: Commit**

```bash
git add frontend/src/components/admin/system_settings/graphql.ts frontend/src/types/graphql-api.ts
git commit -m "Add enabled_components to frontend GraphQL operations and types"
```

---

## Task 7: Build the ComponentLibrary section component

**Files:**
- Create: `frontend/src/components/admin/system_settings/ComponentLibrary.tsx`
- Modify: `frontend/src/components/admin/system_settings/styles.ts` (add new styled components)

This component replaces the stage-centric pipeline flow with a flat, filterable list of all components.

**Step 1: Add styled components for the library**

Add to `frontend/src/components/admin/system_settings/styles.ts`:

```typescript
// Component Library styles
export const LibraryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${OS_LEGAL_SPACING.gaps.md};
`;

export const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: ${OS_LEGAL_SPACING.gaps.sm};
  flex-wrap: wrap;
`;

export const FilterChip = styled.button<{ $active: boolean }>`
  padding: 0.375rem 0.75rem;
  border-radius: ${OS_LEGAL_SPACING.borderRadius.pill};
  border: 1px solid ${(p) => (p.$active ? OS_LEGAL_COLORS.accent.primary : OS_LEGAL_COLORS.border.default)};
  background: ${(p) => (p.$active ? OS_LEGAL_COLORS.accent.primaryLight : OS_LEGAL_COLORS.surface.secondary)};
  color: ${(p) => (p.$active ? OS_LEGAL_COLORS.accent.primary : OS_LEGAL_COLORS.text.secondary)};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${OS_LEGAL_COLORS.accent.primary};
  }
`;

export const SearchInput = styled.div`
  flex: 1;
  min-width: 200px;
`;

export const ComponentListItem = styled.div<{ $disabled: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid ${OS_LEGAL_COLORS.border.default};
  border-radius: ${OS_LEGAL_SPACING.borderRadius.card};
  background: ${(p) => (p.$disabled ? OS_LEGAL_COLORS.surface.tertiary : OS_LEGAL_COLORS.surface.primary)};
  opacity: ${(p) => (p.$disabled ? 0.6 : 1)};
  transition: all 0.15s ease;
`;

export const ComponentInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ComponentTitle = styled.div`
  font-weight: 600;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.text.primary};
`;

export const ComponentDescription = styled.div`
  font-size: 0.8125rem;
  color: ${OS_LEGAL_COLORS.text.secondary};
  margin-top: 0.25rem;
`;

export const BadgeRow = styled.div`
  display: flex;
  gap: 0.375rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
`;

export const StageBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: ${OS_LEGAL_SPACING.borderRadius.pill};
  background: ${(p) => p.$color}15;
  color: ${(p) => p.$color};
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
`;

export const FileTypeBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: ${OS_LEGAL_SPACING.borderRadius.pill};
  background: ${OS_LEGAL_COLORS.surface.secondary};
  color: ${OS_LEGAL_COLORS.text.secondary};
  font-size: 0.6875rem;
  font-weight: 500;
`;
```

**Step 2: Build the ComponentLibrary component**

Create `frontend/src/components/admin/system_settings/ComponentLibrary.tsx`:

```typescript
import React, { useState, useCallback, useMemo, memo } from "react";
import { Input } from "@os-legal/ui";
import { Search } from "lucide-react";
import { PipelineComponentType } from "../../../types/graphql-api";
import { SettingsSchemaEntry } from "./types";
import { STAGE_CONFIG } from "./config";
import { AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import {
  LibraryContainer,
  FilterBar,
  FilterChip,
  SearchInput,
  ComponentListItem,
  ComponentInfo,
  ComponentTitle,
  ComponentDescription,
  BadgeRow,
  StageBadge,
  FileTypeBadge,
  SectionHeader,
  SectionTitle,
} from "./styles";
import { Toggle } from "@os-legal/ui";  // or a switch component
import { Package } from "lucide-react";

type StageFilter = "all" | "parsers" | "embedders" | "thumbnailers" | "post_processors";

interface ComponentLibraryProps {
  components: {
    parsers: (PipelineComponentType & { className: string })[];
    embedders: (PipelineComponentType & { className: string })[];
    thumbnailers: (PipelineComponentType & { className: string })[];
    post_processors?: (PipelineComponentType & { className: string })[];
  };
  enabledComponents: string[];
  updating: boolean;
  onToggleEnabled: (className: string, enabled: boolean) => void;
  onAddSecrets: (componentPath: string) => void;
  onDeleteSecrets: (componentPath: string) => void;
  onSaveConfig: (componentPath: string, values: Record<string, string>) => void;
  getConfigSettings: (className: string) => SettingsSchemaEntry[];
  getSecretSettings: (className: string) => SettingsSchemaEntry[];
}

const STAGE_FILTERS: { key: StageFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "parsers", label: "Parsers" },
  { key: "embedders", label: "Embedders" },
  { key: "thumbnailers", label: "Thumbnailers" },
  { key: "post_processors", label: "Post-Processors" },
];

const STAGE_COLORS: Record<string, string> = {
  parser: STAGE_CONFIG.parsers.color,
  embedder: STAGE_CONFIG.embedders.color,
  thumbnailer: STAGE_CONFIG.thumbnailers.color,
  post_processor: "#8B5CF6",
};

export const ComponentLibrary = memo<ComponentLibraryProps>(({
  components,
  enabledComponents,
  updating,
  onToggleEnabled,
  onAddSecrets,
  onDeleteSecrets,
  onSaveConfig,
  getConfigSettings,
  getSecretSettings,
}) => {
  const [filter, setFilter] = useState<StageFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedSettings, setExpandedSettings] = useState<Record<string, boolean>>({});

  // Flatten all components into a single list with stage info
  const allComponents = useMemo(() => {
    const list: (PipelineComponentType & { className: string })[] = [];
    list.push(...components.parsers);
    list.push(...components.embedders);
    list.push(...components.thumbnailers);
    if (components.post_processors) {
      list.push(...components.post_processors);
    }
    return list;
  }, [components]);

  // Filter and search
  const filteredComponents = useMemo(() => {
    let result = allComponents;

    if (filter !== "all") {
      const typeMap: Record<StageFilter, string> = {
        all: "",
        parsers: "parser",
        embedders: "embedder",
        thumbnailers: "thumbnailer",
        post_processors: "post_processor",
      };
      const targetType = typeMap[filter];
      result = result.filter((c) => c.componentType === targetType);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(q) ||
          (c.name || "").toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [allComponents, filter, search]);

  const isEnabled = useCallback(
    (className: string) => {
      if (!enabledComponents || enabledComponents.length === 0) return true;
      return enabledComponents.includes(className);
    },
    [enabledComponents]
  );

  const toggleSettings = useCallback((className: string) => {
    setExpandedSettings((prev) => ({
      ...prev,
      [className]: !prev[className],
    }));
  }, []);

  return (
    <LibraryContainer>
      <SectionHeader>
        <SectionTitle>
          <Package size={18} />
          Pipeline Components
        </SectionTitle>
      </SectionHeader>

      <FilterBar>
        {STAGE_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            $active={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </FilterChip>
        ))}
        <SearchInput>
          <Input
            placeholder="Search components..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
          />
        </SearchInput>
      </FilterBar>

      {filteredComponents.map((comp) => {
        const enabled = isEnabled(comp.className);
        const configSettings = getConfigSettings(comp.className);
        const secretSettings = getSecretSettings(comp.className);
        const settingsKey = comp.className;

        return (
          <ComponentListItem key={comp.className} $disabled={!enabled}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(comp.className, e.target.checked)}
              disabled={updating}
              aria-label={`Enable ${comp.title || comp.name}`}
            />
            <ComponentInfo>
              <ComponentTitle>{comp.title || comp.name}</ComponentTitle>
              {comp.description && (
                <ComponentDescription>{comp.description}</ComponentDescription>
              )}
              <BadgeRow>
                {comp.componentType && (
                  <StageBadge $color={STAGE_COLORS[comp.componentType] || "#6B7280"}>
                    {comp.componentType}
                  </StageBadge>
                )}
                {(comp.supportedFileTypes || []).map((ft) => (
                  <FileTypeBadge key={String(ft)}>
                    {String(ft).toUpperCase()}
                  </FileTypeBadge>
                ))}
              </BadgeRow>

              {/* Reuse AdvancedSettingsPanel */}
              <AdvancedSettingsPanel
                currentSelection={comp.className}
                configSettings={configSettings}
                secretSettings={secretSettings}
                isExpanded={expandedSettings[settingsKey] || false}
                settingsKey={settingsKey}
                saving={updating}
                onToggle={() => toggleSettings(settingsKey)}
                onAddSecrets={onAddSecrets}
                onDeleteSecrets={onDeleteSecrets}
                onSaveConfig={onSaveConfig}
              />
            </ComponentInfo>
          </ComponentListItem>
        );
      })}

      {filteredComponents.length === 0 && (
        <ComponentListItem $disabled>
          <ComponentInfo>
            <ComponentDescription>
              No components match your filter.
            </ComponentDescription>
          </ComponentInfo>
        </ComponentListItem>
      )}
    </LibraryContainer>
  );
});

ComponentLibrary.displayName = "ComponentLibrary";
```

Note: The exact `Toggle`/checkbox implementation may need adjustment based on what `@os-legal/ui` provides. Use a native checkbox if no toggle component is available.

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (fix any import issues).

**Step 4: Commit**

```bash
git add frontend/src/components/admin/system_settings/ComponentLibrary.tsx frontend/src/components/admin/system_settings/styles.ts
git commit -m "Add ComponentLibrary section for pipeline component management

Flat filterable list with enable/disable toggles, stage/filetype badges,
and expandable settings panels per component."
```

---

## Task 8: Build the FiletypeDefaults section component

**Files:**
- Create: `frontend/src/components/admin/system_settings/FiletypeDefaults.tsx`
- Modify: `frontend/src/components/admin/system_settings/styles.ts` (add styles)

**Step 1: Add styled components**

Add to `styles.ts`:

```typescript
// Filetype Defaults styles
export const DefaultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${OS_LEGAL_SPACING.gaps.md};
`;

export const FiletypeRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr 1fr 1fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border: 1px solid ${OS_LEGAL_COLORS.border.default};
  border-radius: ${OS_LEGAL_SPACING.borderRadius.card};
  background: ${OS_LEGAL_COLORS.surface.primary};

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
`;

export const FiletypeLabel = styled.div`
  font-weight: 600;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.text.primary};
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

export const StageDropdownLabel = styled.div`
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  color: ${OS_LEGAL_COLORS.text.tertiary};
  margin-bottom: 0.25rem;
`;

export const DefaultsHeaderRow = styled.div`
  display: grid;
  grid-template-columns: 120px 1fr 1fr 1fr;
  gap: 1rem;
  padding: 0 1rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: ${OS_LEGAL_COLORS.text.tertiary};

  @media (max-width: 768px) {
    display: none;
  }
`;
```

**Step 2: Build the FiletypeDefaults component**

Create `frontend/src/components/admin/system_settings/FiletypeDefaults.tsx`:

```typescript
import React, { useCallback, useMemo, memo } from "react";
import { FileText, Image, Cpu } from "lucide-react";
import { PipelineComponentType } from "../../../types/graphql-api";
import { SUPPORTED_MIME_TYPES, MIME_TO_SHORT_LABEL } from "../../../assets/configurations/constants";
import { getComponentDisplayName } from "../PipelineIcons";
import {
  DefaultsContainer,
  FiletypeRow,
  FiletypeLabel,
  StageDropdownLabel,
  DefaultsHeaderRow,
  SectionHeader,
  SectionTitle,
  DefaultEmbedderDisplay,
  DefaultEmbedderInfo,
  DefaultEmbedderPath,
  ComponentName,
  EmptyValue,
} from "./styles";
import { Button } from "@os-legal/ui";
import { Settings } from "lucide-react";

interface FiletypeDefaultsProps {
  components: {
    parsers: (PipelineComponentType & { className: string })[];
    embedders: (PipelineComponentType & { className: string })[];
    thumbnailers: (PipelineComponentType & { className: string })[];
  };
  enabledComponents: string[];
  preferredParsers: Record<string, string>;
  preferredEmbedders: Record<string, string>;
  preferredThumbnailers: Record<string, string>;
  defaultEmbedder: string;
  updating: boolean;
  onAssign: (
    stage: "parsers" | "embedders" | "thumbnailers",
    mimeType: string,
    className: string
  ) => void;
  onEditDefaultEmbedder: () => void;
}

export const FiletypeDefaults = memo<FiletypeDefaultsProps>(({
  components,
  enabledComponents,
  preferredParsers,
  preferredEmbedders,
  preferredThumbnailers,
  defaultEmbedder,
  updating,
  onAssign,
  onEditDefaultEmbedder,
}) => {
  // Filter to only enabled components
  const isEnabled = useCallback(
    (className: string) => {
      if (!enabledComponents || enabledComponents.length === 0) return true;
      return enabledComponents.includes(className);
    },
    [enabledComponents]
  );

  // Get enabled components for a stage that support a given MIME type
  const getEnabledForMime = useCallback(
    (
      stage: "parsers" | "embedders" | "thumbnailers",
      mimeType: string
    ): (PipelineComponentType & { className: string })[] => {
      const stageComps = components[stage] || [];
      const mimeShort = MIME_TO_SHORT_LABEL[mimeType]?.toLowerCase();

      return stageComps.filter((comp) => {
        if (!isEnabled(comp.className)) return false;
        const fileTypes = (comp.supportedFileTypes || [])
          .filter((ft): ft is NonNullable<typeof ft> => Boolean(ft))
          .map((ft) => String(ft).toLowerCase());
        if (fileTypes.length === 0) return true;
        if (!mimeShort) return false;
        return fileTypes.some((ft) => ft === mimeShort || ft === mimeType.toLowerCase());
      });
    },
    [components, isEnabled]
  );

  const mappings: Record<string, Record<string, string>> = useMemo(
    () => ({
      parsers: preferredParsers || {},
      embedders: preferredEmbedders || {},
      thumbnailers: preferredThumbnailers || {},
    }),
    [preferredParsers, preferredEmbedders, preferredThumbnailers]
  );

  return (
    <DefaultsContainer>
      <SectionHeader>
        <SectionTitle>
          <Settings size={18} />
          Filetype Defaults
        </SectionTitle>
      </SectionHeader>

      <DefaultsHeaderRow>
        <div>File Type</div>
        <div>Parser</div>
        <div>Embedder</div>
        <div>Thumbnailer</div>
      </DefaultsHeaderRow>

      {SUPPORTED_MIME_TYPES.map((mime) => (
        <FiletypeRow key={mime.value}>
          <FiletypeLabel>
            <FileText size={16} />
            {mime.shortLabel}
          </FiletypeLabel>

          {(["parsers", "embedders", "thumbnailers"] as const).map((stage) => {
            const available = getEnabledForMime(stage, mime.value);
            const current = mappings[stage][mime.value] || "";

            return (
              <div key={stage}>
                <StageDropdownLabel>{stage.replace(/s$/, "")}</StageDropdownLabel>
                <select
                  value={current}
                  onChange={(e) => onAssign(stage, mime.value, e.target.value)}
                  disabled={updating || available.length === 0}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: `1px solid ${current ? "#e2e8f0" : "#fbbf24"}` }}
                >
                  <option value="">
                    {available.length === 0 ? "None available" : "— Select —"}
                  </option>
                  {available.map((comp) => (
                    <option key={comp.className} value={comp.className}>
                      {getComponentDisplayName(comp.className, comp.title || undefined)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </FiletypeRow>
      ))}

      {/* Default Embedder */}
      <FiletypeRow>
        <FiletypeLabel>
          <Cpu size={16} />
          Fallback
        </FiletypeLabel>
        <div style={{ gridColumn: "2 / -1" }}>
          <StageDropdownLabel>Default Embedder</StageDropdownLabel>
          <DefaultEmbedderDisplay>
            {defaultEmbedder ? (
              <DefaultEmbedderInfo>
                <ComponentName>{getComponentDisplayName(defaultEmbedder)}</ComponentName>
                <DefaultEmbedderPath>{defaultEmbedder}</DefaultEmbedderPath>
              </DefaultEmbedderInfo>
            ) : (
              <EmptyValue>Using system default</EmptyValue>
            )}
            <Button variant="secondary" size="sm" onClick={onEditDefaultEmbedder}>
              Edit
            </Button>
          </DefaultEmbedderDisplay>
        </div>
      </FiletypeRow>
    </DefaultsContainer>
  );
});

FiletypeDefaults.displayName = "FiletypeDefaults";
```

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add frontend/src/components/admin/system_settings/FiletypeDefaults.tsx frontend/src/components/admin/system_settings/styles.ts
git commit -m "Add FiletypeDefaults section for MIME type to component assignment

Grid layout with one row per MIME type, dropdowns filtered to enabled
components that support each file type."
```

---

## Task 9: Rewire SystemSettings to use new sections

**Files:**
- Modify: `frontend/src/components/admin/SystemSettings.tsx`

This is the integration task — replace the pipeline flow with the two new sections.

**Step 1: Update imports**

Remove the pipeline flow styled component imports (`PipelineFlowContainer`, `ChannelTrack`, `ChannelGlow`, `ChannelCenterLine`, `StageRow`, `StageRowSpacer`, `JunctionColumn`, `ConnectorArm`, `IntakeCard`, `IntakeText`, `IntakeNode`, `IntakeNodeCenter`, `OutputCheckmark`, `OutputInfo`, `OutputTitle`, `OutputSubtitle`).

Remove `FlowParticles` import.
Remove `PipelineStageSection` import.

Add imports:
```typescript
import { ComponentLibrary } from "./system_settings/ComponentLibrary";
import { FiletypeDefaults } from "./system_settings/FiletypeDefaults";
```

**Step 2: Remove stage-centric state**

Remove the `selectedMimeTypes` state (lines 109-115).
Remove `handleMimeTypeChange` callback (lines 430-438).
Remove `renderStage` callback (lines 611-670).
Remove `getComponentsForStage` callback (lines 338-366).
Remove `getCurrentSelection` callback (lines 330-335).
Remove `currentSelections` memo (lines 313-327).

**Step 3: Add enabled_components state handling**

Add a callback for toggling component enabled state:

```typescript
const handleToggleEnabled = useCallback(
  (className: string, enabled: boolean) => {
    const currentEnabled = settings?.enabledComponents || [];
    let newEnabled: string[];

    if (currentEnabled.length === 0) {
      // Transitioning from "all enabled" — build full list minus this one if disabling
      const allPaths = [
        ...componentsByStage.parsers,
        ...componentsByStage.embedders,
        ...componentsByStage.thumbnailers,
      ].map((c) => c.className);

      newEnabled = enabled
        ? allPaths
        : allPaths.filter((p) => p !== className);
    } else {
      newEnabled = enabled
        ? [...currentEnabled, className]
        : currentEnabled.filter((p: string) => p !== className);
    }

    updateSettings({
      variables: { enabledComponents: newEnabled },
    });
  },
  [settings, componentsByStage, updateSettings]
);
```

Add a callback for filetype assignment:

```typescript
const handleAssign = useCallback(
  (
    stage: "parsers" | "embedders" | "thumbnailers",
    mimeType: string,
    className: string
  ) => {
    const settingsKey = STAGE_CONFIG[stage].settingsKey;
    const currentMapping =
      (settings?.[settingsKey] as Record<string, string> | undefined) ?? {};
    const newMapping = { ...currentMapping };

    if (className) {
      newMapping[mimeType] = className;
    } else {
      delete newMapping[mimeType];
    }

    updateSettings({
      variables: { [settingsKey]: newMapping },
    });
  },
  [settings, updateSettings]
);
```

**Step 4: Replace the pipeline flow JSX**

Replace everything between `<WarningBanner>` and `{/* Default Embedder Section */}` (lines 742-787) with:

```tsx
{/* Component Library */}
<ComponentLibrary
  components={componentsByStage}
  enabledComponents={settings?.enabledComponents || []}
  updating={updating}
  onToggleEnabled={handleToggleEnabled}
  onAddSecrets={handleAddSecrets}
  onDeleteSecrets={handleDeleteSecretsClick}
  onSaveConfig={handleSaveComponentSettings}
  getConfigSettings={getNonSecretSettingsForComponent}
  getSecretSettings={getSecretSettingsForComponent}
/>

{/* Filetype Defaults */}
<FiletypeDefaults
  components={componentsByStage}
  enabledComponents={settings?.enabledComponents || []}
  preferredParsers={(settings?.preferredParsers as Record<string, string>) || {}}
  preferredEmbedders={(settings?.preferredEmbedders as Record<string, string>) || {}}
  preferredThumbnailers={(settings?.preferredThumbnailers as Record<string, string>) || {}}
  defaultEmbedder={settings?.defaultEmbedder || ""}
  updating={updating}
  onAssign={handleAssign}
  onEditDefaultEmbedder={handleEditDefaultEmbedder}
/>
```

**Step 5: Remove the now-separate Default Embedder Section**

The default embedder is now rendered inside `FiletypeDefaults`, so remove the standalone `{/* Default Embedder Section */}` block (lines 789-821).

**Step 6: Clean up unused styled component imports and unused callbacks**

Remove all imports that are no longer referenced. Also remove `PIPELINE_UI` from the constants import if no longer needed (check if still used by secrets modal).

**Step 7: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 8: Visually verify in dev**

Run: `cd frontend && yarn start`
Navigate to admin settings → Pipeline Configuration tab. Verify both sections render.

**Step 9: Commit**

```bash
git add frontend/src/components/admin/SystemSettings.tsx
git commit -m "Rewire SystemSettings to use ComponentLibrary and FiletypeDefaults sections

Replaces stage-centric pipeline flow with two-section layout:
component library with enable/disable toggles and filetype
defaults with per-MIME-type dropdown assignment."
```

---

## Task 10: Clean up unused styles and components

**Files:**
- Modify: `frontend/src/components/admin/system_settings/styles.ts`
- Possibly delete: `frontend/src/components/admin/system_settings/PipelineStageSection.tsx`
- Possibly delete: `frontend/src/components/admin/system_settings/PipelineComponentCard.tsx`

**Step 1: Identify unused exports**

Check if `PipelineStageSection` and `PipelineComponentCard` are imported anywhere other than `SystemSettings.tsx`. If not, delete them.

**Step 2: Remove unused styled components from `styles.ts`**

Remove stage-centric styled components no longer imported by any file:
- `StageRow`, `StageRowSpacer`, `JunctionColumn`, `JunctionPulseRing`, `JunctionDot`, `ConnectorArm`
- `StageCardContainer`, `StageCardAccentBar`, `StageCardHeader`, `StageHeaderInfo`
- `StageNumberBadge`, `StageTitle`, `StageSubtitle`
- `MimeSelector`, `MimeButton`
- `StageCardContent`, `ComponentGrid`
- `PipelineFlowContainer`, `ChannelTrack`, `ChannelGlow`, `ChannelCenterLine`
- `PipelineContentColumn`
- `IntakeCard`, `IntakeText`, `IntakeNode`, `IntakeNodeCenter`
- `OutputCheckmark`, `OutputInfo`, `OutputTitle`, `OutputSubtitle`

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add -u frontend/src/components/admin/system_settings/
git commit -m "Remove unused stage-centric pipeline components and styles"
```

---

## Task 11: Update frontend tests

**Files:**
- Modify: `frontend/tests/admin-components.ct.tsx`
- Modify: `frontend/tests/AdminComponentsTestWrapper.tsx` (if mock data needs updating)

**Step 1: Update GraphQL mock data**

Add `enabled: true` to all component mocks in the test wrapper. Add `enabledComponents: [...]` to pipeline settings mock data.

**Step 2: Update test assertions**

Replace tests that assert on the old pipeline flow layout (stages, MIME type buttons, component grids) with tests that assert on:

- Component Library section renders with component list items
- Filter chips (All, Parsers, Embedders, etc.) filter the list
- Enable/disable checkbox toggles
- Filetype Defaults section renders with MIME type rows
- Dropdown selects show enabled components
- Changing a dropdown fires the mutation

**Step 3: Add new test cases**

- Test: disabling a component that is assigned shows confirmation (or removes assignment)
- Test: filter chips filter the component list correctly
- Test: search input filters components by name

**Step 4: Run component tests**

Run: `cd frontend && yarn test:ct --reporter=list -g "SystemSettings"`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add frontend/tests/admin-components.ct.tsx frontend/tests/AdminComponentsTestWrapper.tsx
git commit -m "Update admin component tests for new two-section pipeline layout"
```

---

## Task 12: Update types.ts to remove unused stage types

**Files:**
- Modify: `frontend/src/components/admin/system_settings/types.ts`

**Step 1: Clean up**

Remove `PipelineStageSectionProps` if `PipelineStageSection` was deleted. Remove `PipelineComponentCardProps` if `PipelineComponentCard` was deleted.

Keep `StageType`, `PipelineMappingKey`, `SettingsSchemaEntry`, and `AdvancedSettingsPanelProps` as they're still used.

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/components/admin/system_settings/types.ts
git commit -m "Remove unused type definitions from pipeline system_settings"
```

---

## Task 13: Run full test suites and verify

**Step 1: Run pre-commit hooks**

Run: `pre-commit run --all-files`
Fix any formatting issues.

**Step 2: Run backend tests**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_pipeline_settings.py opencontractserver/tests/test_pipeline_component_queries.py -v`
Expected: All PASS.

**Step 3: Run frontend component tests**

Run: `cd frontend && yarn test:ct --reporter=list`
Expected: All PASS.

**Step 4: Verify TypeScript compilation**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Fix lint and formatting issues from pipeline component redesign"
```

---

## Task 14: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

**Step 1: Add entry under `[Unreleased]`**

```markdown
### Changed
- **Pipeline Configuration UI redesigned**: Split into two sections — "Pipeline Components" (component library with enable/disable toggles, settings, and secrets management) and "Filetype Defaults" (per-MIME-type assignment dropdowns). Replaced stage-centric flow visualization.
- Added `enabled_components` field to `PipelineSettings` model for explicit component enable/disable control
- Updated `UpdatePipelineSettingsMutation` to support `enabled_components` with validation that assigned components must be enabled
- Added `enabled` field to `PipelineComponentType` GraphQL type
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "Update CHANGELOG for pipeline component management redesign"
```
