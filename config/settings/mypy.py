"""
Settings module used exclusively by `mypy_django_plugin` during type checking.

The plugin imports this module at startup to introspect `INSTALLED_APPS` and
model metadata. It does **not** run the ORM, so the database URL below is a
dummy value that only needs to parse cleanly through `django-environ`.

Keeping a dedicated module here (instead of pointing the plugin at
`config.settings.test`) means contributors do not need to set `DATABASE_URL`
to run mypy locally or via pre-commit.
"""

import os

# `env.db(...)` in `config.settings.base` will raise unless DATABASE_URL is
# set. Provide a harmless default before the base import runs.
os.environ.setdefault(
    "DATABASE_URL", "postgres://mypy:mypy@localhost:5432/mypy_dummy_db"
)

from .test import *  # noqa: E402, F401, F403
