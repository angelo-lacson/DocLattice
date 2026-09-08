# Test: DocLattice rebrand

## Purpose

Verify that the renamed package, migration, parser protocol, GraphQL schema,
deployment files, and documentation remain consistent.

## Prerequisites

- An isolated development/test environment with the sample test environment
  files and rebuilt Django image. See `test.yml` and `CLAUDE.md` for setup.
- Frontend dependencies, pre-commit, and `requirements/docs.txt` installed.
- The working tree and Git index both use the renamed package paths.

## Steps

1. Validate each Compose model without reading deployment credentials:

   ```bash
   docker compose -f local.yml config --no-env-resolution --no-interpolate --quiet
   docker compose -f production.yml config --no-env-resolution --no-interpolate --quiet
   docker compose -f test.yml config --no-env-resolution --no-interpolate --quiet
   docker compose -f scripts/remote_ingest/remote_worker.yml config --no-env-resolution --no-interpolate --quiet
   ```

2. Run the focused backend tests:

   ```bash
   docker compose -f test.yml run --rm django python manage.py test \
     doclatticeserver.tests.test_rebrand_component_paths \
     doclatticeserver.tests.test_schema_parity \
     doclatticeserver.tests.test_doc_parser_warp_ingest \
     doclatticeserver.tests.test_pipeline_registry \
     doclatticeserver.tests.test_pipeline_settings \
     doclatticeserver.tests.test_base_pipeline_parser \
     doclatticeserver.tests.architecture.test_celery_task_registration --keepdb
   docker compose -f test.yml run --rm django python manage.py check
   docker compose -f test.yml run --rm django python manage.py makemigrations --check --dry-run
   ```

3. Run repository checks and build the documentation:

   ```bash
   pre-commit run --all-files
   python scripts/collate_changelog.py --check
   mkdocs build --site-dir /tmp/doclattice-docs-check
   ```

4. From `frontend`, run the TypeScript check and unit tests:

   ```bash
   yarn tsc --noEmit
   yarn test:unit --run
   ```

5. In the same frontend directory, run the affected browser component tests:

   ```bash
   yarn test:ct --reporter=list --workers=1 \
     tests/NavMenu.ct.tsx tests/Footer.ct.tsx tests/Login.ct.tsx \
     tests/HeaderBar.ct.tsx tests/landing-components.ct.tsx tests/About.ct.tsx \
     tests/ModernLoadingDisplay.ct.tsx tests/CookieConsent.ct.tsx \
     tests/SelectExportTypeModal.ct.tsx tests/CamlArticle.ct.tsx \
     tests/CorpusNavigationScreenshots.ct.tsx
   ```

## Expected results

Compose validation and the focused backend tests pass. Django reports no system
check issues and no missing migrations. The migration updates stored component
paths while preserving records, relationships, credentials, and embedding
vectors. Warp-Ingest requests retain its external `opencontracts` render format.

TypeScript, unit and component tests, and pre-commit complete successfully. MkDocs generates
the site; review any link warnings separately from build failures. The migration
guide and renamed backend references resolve to existing files.

## Cleanup

Remove only the test environment and generated `/tmp/doclattice-docs-check`
directory created for this verification. Keep production volumes and deployment
configuration intact.
