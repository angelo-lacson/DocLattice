# Type Checking (mypy)

This directory documents how OpenContracts' Python type-checking pipeline is
wired up and how to graduate modules out of the initial baseline.

## How it is wired

- **Configuration**: `setup.cfg` `[mypy]` section.
  - `python_version = 3.11` (matches `requirements/base.txt` runtime).
  - `plugins = mypy_django_plugin.main, mypy_drf_plugin.main` — Django- and
    DRF-aware type inference (models, querysets, serializers, etc.).
  - `django_settings_module = config.settings.mypy` — a thin wrapper around
    `config.settings.test` that supplies a dummy `DATABASE_URL` so mypy runs
    without needing an env var. The plugin introspects `INSTALLED_APPS`,
    model fields, reverse relations, etc. but never actually connects.
  - `check_untyped_defs`, `warn_unused_ignores`, `warn_redundant_casts`, and
    `warn_unused_configs` are on so the bar rises as modules graduate.
  - `ignore_missing_imports = True` — most ML/pipeline deps
    (`pdfplumber`, `docling`, `sentence-transformers`, …) ship no stubs.
- **Pre-commit hook**: `.pre-commit-config.yaml` runs
  `pre-commit/mirrors-mypy` with stubs + the minimum Django runtime pinned in
  `additional_dependencies` so contributors don't need the full dev env
  installed locally.
- **CI**: `.github/workflows/backend.yml` runs
  `python -m mypy --config-file setup.cfg opencontractserver config` as part
  of the `linter` job, on the same pinned Python 3.12 runner as the rest of
  the lint pipeline (the plugin reads `python_version` from `setup.cfg`, so
  the runner Python and the checked-code Python can differ).

## How to run mypy locally

### Inside the Django Docker container (recommended)

The test container already has every runtime dep installed, which keeps the
Django plugin happy.

```bash
docker compose -f test.yml run --rm django \
  python -m mypy --config-file setup.cfg opencontractserver config
```

### Via pre-commit (isolated env)

```bash
pre-commit run mypy --all-files
```

Pre-commit builds its own virtualenv from the hook's `additional_dependencies`
on first run (a few minutes) and caches it afterwards.

### Via your own dev virtualenv

```bash
pip install -r requirements/local.txt
python -m mypy --config-file setup.cfg opencontractserver config
```

No `DATABASE_URL` env var is required — `config.settings.mypy` bakes in a
dummy one for type-checking only.

## Why there is a baseline

As of issue #1331 the codebase has ~7.2k pre-existing mypy errors across 357
files (see `mypy_baseline.txt`). Forcing all of those to be fixed in one go
would block the rest of the remediation work, so instead we turned on mypy
with `ignore_errors = True` for every `opencontractserver.*` and `config.*`
module. That keeps the pipeline green today **and** lets CI start gating
against *new* regressions (e.g. a brand-new file with type errors, or a file
added to an already-graduated package, still fails the hook).

The full list of errors at the time of the initial wire-up is frozen in
`mypy_baseline.txt` so follow-up issues can measure progress and reviewers
can see what a given file currently has wrong without re-running mypy
without the baseline.

### Baseline shape (issue #1331)

| Metric                | Value |
|-----------------------|-------|
| Files with errors     | 357   |
| Total error messages  | 7208  |
| Top error code        | `attr-defined` (2403) |
| Next most common      | `union-attr` (355), `arg-type` (159), `assignment` (83), `valid-type` (82), `misc` (81) |
| Worst offender (file) | `opencontractserver/mcp/tests/test_mcp.py` (319 errors) |

The full breakdown lives in `mypy_baseline.txt` (sorted by file + line for
stable diffs).

## How to graduate a module out of the baseline

The baseline is a per-module `ignore_errors = True` override in `setup.cfg`:

```ini
[mypy-opencontractserver.*]
ignore_errors = True

[mypy-config.*]
ignore_errors = True
```

Graduate by **narrowing** the pattern so the module you want to type-check
falls outside the baseline.

### Example: graduating `opencontractserver.constants`

1. Add an override that re-enables checking for just that subtree:

    ```ini
    [mypy-opencontractserver.constants.*]
    ignore_errors = False
    ```

2. Run mypy and fix what surfaces:

    ```bash
    python -m mypy --config-file setup.cfg opencontractserver config
    ```

3. Update `mypy_baseline.txt` — remove the now-fixed entries so future diffs
   stay honest. (`docs/typing/mypy_baseline.txt` is an advisory reference; it
   is not consumed by mypy itself, so it needs manual pruning.)

4. Commit with a message referencing the tracker issue, e.g.
   `typing: graduate opencontractserver.constants (refs #1331)`.

### Order we'd suggest graduating in

Pick small, leaf-ish modules first so the Django plugin has less surface to
cover:

1. `opencontractserver/constants/*` — pure Python constants, no imports.
2. `opencontractserver/utils/*` helpers that don't touch models.
3. `config/settings/*` — narrow and rarely changed.
4. Apps with small `models.py` footprints (e.g. `feedback`, `discovery`).
5. Work outwards into GraphQL types and views.

## How to suppress a single error

Prefer fixing the error. When that isn't realistic in the current PR:

```python
foo = something_mypy_doesnt_like()  # type: ignore[assignment]
```

Always pass the error code in brackets — `warn_unused_ignores` is on, so
bare `# type: ignore` comments will themselves produce errors once the
surrounding module graduates.

If a *whole* module can't be fixed yet but you want to leave a trail:

```ini
[mypy-opencontractserver.legacy_thing]
ignore_errors = True
```

…with a comment pointing at the tracker issue that will remove it.

## Troubleshooting

- **`Error constructing plugin instance of NewSemanalDjangoPlugin`** — the
  Django plugin imports `config.settings.test`, which transitively imports
  most of `INSTALLED_APPS`. Missing one of those apps (e.g. `celery`,
  `channels`, `django-storages`) is almost always the cause. Install the
  missing dep or run mypy from inside the test container.
- **`Set the DATABASE_URL environment variable`** — you're pointing mypy at
  `config.settings.test` or `.base` instead of `config.settings.mypy`.
  Double-check `django_settings_module` in `setup.cfg`.
- **`Library stubs not installed for "requests"`** — add `types-requests`
  to the hook's `additional_dependencies` (and to the dev env if you want
  the error to go away locally outside pre-commit).
