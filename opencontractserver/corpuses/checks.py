"""
Django system checks for embedder configuration (Issue #437).

These checks run at startup to detect potentially dangerous configuration
changes that could cause search inconsistencies.
"""

import logging

from django.conf import settings
from django.core.checks import Tags, Warning, register

logger = logging.getLogger(__name__)


@register(Tags.models)
def check_default_embedder_consistency(app_configs, **kwargs):
    """
    Warn if DEFAULT_EMBEDDER has changed since existing corpuses were created.

    When DEFAULT_EMBEDDER changes, existing annotations retain embeddings from
    the old embedder while new annotations get the new one. Global search
    (which filters by embedder_path) will silently miss old content.

    This check queries the database for corpuses whose created_with_embedder
    differs from the current DEFAULT_EMBEDDER and issues a warning if found.
    """
    errors = []

    try:
        # Only run this check when the database is available (not during
        # initial migration or table creation).
        from django.db import connection

        tables = connection.introspection.table_names()
        if "corpuses_corpus" not in tables:
            return errors

        # Check if the created_with_embedder column exists yet
        # (migration may not have run)
        columns = [
            col.name
            for col in connection.introspection.get_table_description(
                connection.cursor(), "corpuses_corpus"
            )
        ]
        if "created_with_embedder" not in columns:
            return errors

        from opencontractserver.corpuses.models import Corpus

        current_default = getattr(settings, "DEFAULT_EMBEDDER", None)
        if not current_default:
            errors.append(
                Warning(
                    "DEFAULT_EMBEDDER is not configured.",
                    hint="Set DEFAULT_EMBEDDER in your Django settings.",
                    id="opencontracts.W001",
                )
            )
            return errors

        # Count corpuses created with a different embedder
        mismatched_count = (
            Corpus.objects.exclude(created_with_embedder__isnull=True)
            .exclude(created_with_embedder="")
            .exclude(created_with_embedder=current_default)
            .count()
        )

        if mismatched_count > 0:
            errors.append(
                Warning(
                    f"DEFAULT_EMBEDDER has changed. {mismatched_count} corpus(es) were "
                    f"created with a different embedder than the current default "
                    f"({current_default}). Global search may return incomplete results "
                    f"for annotations in those corpuses.",
                    hint=(
                        "Corpus-scoped search uses each corpus's frozen "
                        "preferred_embedder and is unaffected. To fix global search, "
                        "consider re-embedding affected corpuses using the "
                        "reEmbedCorpus mutation, or revert DEFAULT_EMBEDDER to its "
                        "previous value."
                    ),
                    id="opencontracts.W002",
                )
            )

    except Exception as e:
        # Don't crash startup for a check failure
        logger.debug(f"Embedder consistency check skipped: {e}")

    return errors
