# Pipeline Configuration Guide

This guide covers how to configure the document processing pipeline in OpenContracts, including first-time setup, upgrades, and runtime configuration.

## Overview

OpenContracts uses a **database-backed configuration system** for pipeline settings. This allows superusers to change parsers, embedders, and thumbnailers at runtime without code deployment.

The configuration is stored in a singleton `PipelineSettings` model that tracks:
- **Preferred parsers** per MIME type
- **Preferred embedders** per MIME type
- **Preferred thumbnailers** per MIME type
- **Parser kwargs** (component-specific configuration)
- **Component settings** (advanced overrides)
- **Default embedder** (fallback when no MIME-specific embedder exists)
- **Encrypted secrets** (API keys, credentials)

## First-Time Setup (Fresh Install)

On a fresh installation, pipeline settings are automatically initialized from Django settings during migration.

```bash
# 1. Run migrations - this creates the PipelineSettings singleton
#    and populates it from Django settings (PREFERRED_PARSERS, etc.)
docker compose -f local.yml run django python manage.py migrate

# 2. (Optional) If you have component-specific settings in environment variables,
#    migrate them to the database
docker compose -f local.yml run django python manage.py migrate_pipeline_settings

# 3. (Optional) Verify all components have required settings
docker compose -f local.yml run django python manage.py migrate_pipeline_settings --verify
```

**That's it for basic setup.** The system will use sensible defaults:
- **Docling parser** for PDFs
- **TxtParser** for text files
- **MicroserviceEmbedder** for embeddings

### Environment Variables for First Boot

Set these in your `.env` file or docker-compose environment before first migration:

```bash
# Parser selection (optional - defaults to docling)
PDF_PARSER=docling  # Options: docling, nlm_ingest, llamaparse

# LlamaParse (if using llamaparse parser)
LLAMAPARSE_API_KEY=your-api-key-here

# Multimodal embedder (if using)
MULTIMODAL_EMBEDDER_HOST=multimodal-embedder
MULTIMODAL_EMBEDDER_PORT=8000
MULTIMODAL_EMBEDDER_VECTOR_SIZE=768
```

## Upgrading Existing Installation

When upgrading OpenContracts, the migration system preserves your existing configuration (if you've already setup pipeline settings in the DB). However, if Django settings have new defaults you want to adopt, use `--sync-preferences`:

```bash
# 1. Run migrations
docker compose -f local.yml run django python manage.py migrate

# 2. (Optional) Preview what would change if syncing from Django settings
docker compose -f local.yml run django python manage.py migrate_pipeline_settings --sync-preferences --dry-run

# 3. (Optional) Apply new defaults from Django settings
docker compose -f local.yml run django python manage.py migrate_pipeline_settings --sync-preferences

# 4. (Optional) Migrate any new component settings from environment
docker compose -f local.yml run django python manage.py migrate_pipeline_settings
```

### Understanding the Sync Behavior

| Scenario | What Happens |
|----------|--------------|
| Fresh install | Migration creates singleton from Django settings |
| Upgrade (no action) | Existing DB settings preserved |
| `--sync-preferences` | Overwrites DB preferences with current Django settings |
| `migrate_pipeline_settings` | Migrates component-specific settings from env vars |

## Runtime Configuration (Admin UI)

Superusers can configure the pipeline at runtime through the Admin UI:

1. Navigate to **Admin → Pipeline Configuration**
2. Configure preferred components per MIME type
3. Add API keys via the **Component Secrets** section

### Component Secrets

Sensitive configuration (API keys, credentials) is stored encrypted in the database. Secrets are encrypted using Django's `SECRET_KEY`.

> **Warning**: If you rotate `SECRET_KEY`, all encrypted secrets become unrecoverable. Before rotating:
> 1. Export secrets via Django shell: `PipelineSettings.get_instance().get_secrets()`
> 2. After rotation, re-import: `instance.set_secrets(exported_secrets); instance.save()`

## Management Command Reference

### `migrate_pipeline_settings`

```bash
# Preview what would be migrated
python manage.py migrate_pipeline_settings --dry-run

# Migrate component settings from environment variables
python manage.py migrate_pipeline_settings

# Force overwrite existing DB values with environment values
python manage.py migrate_pipeline_settings --force

# Verify all components have required settings
python manage.py migrate_pipeline_settings --verify

# Sync main preferences (PREFERRED_PARSERS, etc.) from Django settings
python manage.py migrate_pipeline_settings --sync-preferences

# Migrate settings for a specific component only
python manage.py migrate_pipeline_settings --component LlamaParseParser

# Verbose output showing all settings
python manage.py migrate_pipeline_settings --verbose

# Fail with exit code 1 if required settings are missing
python manage.py migrate_pipeline_settings --strict
```

## Configuration Priority

When determining which component to use, the system checks in this order:

1. **Database settings** (`PipelineSettings` model) - highest priority
2. **Django settings** (`PREFERRED_PARSERS`, etc.) - fallback for missing DB entries
3. **Component defaults** - built-in defaults

## Production Deployment

For production deployments:

```bash
# 1. Always run migrations first
docker compose -f production.yml --profile migrate up migrate

# 2. (First deploy only) Migrate settings from environment
docker compose -f production.yml run django python manage.py migrate_pipeline_settings

# 3. Start services
docker compose -f production.yml up -d
```

### Recommended Production Settings

```bash
# .env.production

# Use Docling parser (default, no API key needed)
PDF_PARSER=docling

# Or use LlamaParse (requires API key)
# PDF_PARSER=llamaparse
# LLAMAPARSE_API_KEY=your-production-key

# Embedder settings
DEFAULT_EMBEDDER=opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder
```

## Troubleshooting

### Components Not Available

If a component doesn't appear in the UI:

```bash
# Check registered components
python manage.py migrate_pipeline_settings --verify --verbose
```

### Missing Required Settings

```bash
# Identify missing settings
python manage.py migrate_pipeline_settings --verify

# The output will show which settings need to be configured
```

### Reset to Defaults

To reset all pipeline settings to Django defaults:

1. Via Admin UI: Click "Reset to Defaults" button
2. Via management command:
   ```bash
   python manage.py migrate_pipeline_settings --sync-preferences --force
   ```

## See Also

- [Pipeline Architecture Overview](pipeline_overview.md)
- [Docling Parser](docling_parser.md)
- [LlamaParse Parser](llamaparse_parser.md)
- [Multimodal Embedder](multimodal_embedder.md)
