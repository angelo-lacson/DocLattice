# Upgrading to DocLattice

The repository, Python package, container images, frontend configuration, and
published Git history now use the DocLattice name. Existing installations need
the configuration and database migration below before running this version.

## Preserve the existing installation

Back up the database, uploaded media, environment files, and any local Git work.
Drain pending background tasks, then stop the old web server, workers, and
scheduler. Deploy the frontend and backend together: the WebSocket authentication
subprotocol is now `doclattice.jwt.v1`, and the export-format identifiers are
`DOCLATTICE` and `DOCLATTICE_V2`.

Keep the existing database name, database credentials, storage paths, and
`DJANGO_SECRET_KEY`. The rebrand does not rename an existing database or move its
files. The migration needs the original secret key to read stored pipeline
credentials. Sample environment files are defaults for **new** installations;
do not copy their database values over a working installation.

Docker Compose derives volume names from its project name. If you move or
rename the checkout, keep the project's existing name with `COMPOSE_PROJECT_NAME`
or `docker compose -p <existing-project-name>` so the new containers attach to
the existing volumes. Use `docker compose ls` to identify that name first.

## Update configuration and migrate

1. Update custom Python imports, configured task names, and pipeline class paths
   to the `doclatticeserver` package. Update deployment scripts to the
   `doclatticeserver_*` image names used in the Compose files.
2. Change the old product prefix on frontend container variables to
   `DOCLATTICE_`, retaining the rest of each name; for example,
   `DOCLATTICE_REACT_APP_API_ROOT_URL` and `DOCLATTICE_REACT_APP_USE_AUTH0`.
   Unprefixed `REACT_APP_*` variables used during local frontend builds still
   work. Keep your actual hostnames, Auth0 audience, and claim namespace values.
3. Build the new images, then run migrations before starting application
   services. For the production Compose stack:

   ```bash
   docker compose -f production.yml build
   docker compose -f production.yml --profile migrate run --rm migrate
   docker compose -f production.yml up -d
   ```

   Retain the existing Compose project name for each command. For a local stack,
   run `docker compose -f local.yml run --rm django python manage.py migrate`
   after rebuilding and before restarting its web server and workers.

The [rebrand data migration](https://github.com/angelo-lacson/DocLattice/blob/main/doclatticeserver/documents/migrations/0044_rebrand_component_paths.py)
updates stored package paths in pipeline settings, corpus preferences,
embedding and parser metadata, analyzer and extract tasks, stored export formats,
export processors, and scheduled tasks. It retains document records, embeddings, relationships,
and pipeline credential values. Redis must be available during migration so
cached settings can be invalidated; the production migration service waits for
it automatically. Custom plugins must be updated separately. Review custom
scheduled-task arguments that contain Python paths; arbitrary arguments are
preserved because they may contain document content or credentials.
Deployment-specific site names and domains remain under the operator's control.

The browser uses a new document-cache database and folder-preference keys.
Documents remain on the server; the local cache is rebuilt and folder display
preferences start from their defaults.

## External formats and Git history

Warp-Ingest still requires `render_format=opencontracts` in requests to its
external API. This protocol identifier is intentionally retained. Third-party
container names and original copyright notices also retain their owners' names.

The published commit IDs changed throughout history. Clone
[`angelo-lacson/DocLattice`](https://github.com/angelo-lacson/DocLattice) afresh for
development after backing up local work. Reapply unpublished changes to the new
history; merging a branch from the previous history would restore that history.

Documentation is available in the repository's
[`docs` directory](https://github.com/angelo-lacson/DocLattice/tree/main/docs).
Set `site_url` in `mkdocs.yml` when publishing a documentation site to your own
host.
