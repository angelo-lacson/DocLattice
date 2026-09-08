"""Move persisted Python paths to the DocLattice package without changing data.

The legacy prefix is deliberately retained as a conversion input. Credentials,
uploaded objects, stable analyzer IDs, and embedding vectors are not renamed.
Run with the original SECRET_KEY after draining and stopping old workers.
"""

import base64
import hashlib
import json
import os

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.cache import cache
from django.db import migrations
from django.db.models import F, Value
from django.db.models.functions import Concat, Substr
from django.utils import timezone

LEGACY_PREFIX = "opencontractserver."
PACKAGE_PREFIX = "doclatticeserver."
EXPORT_FORMATS = (
    ("OPEN_CONTRACTS", "DOCLATTICE"),
    ("OPEN_CONTRACTS_V2", "DOCLATTICE_V2"),
)

PIPELINE_PATH_FIELDS = (
    "preferred_parsers",
    "preferred_embedders",
    "preferred_thumbnailers",
    "preferred_enrichers",
    "enabled_components",
    "default_embedder",
    "default_reranker",
    "default_file_converter",
)
PIPELINE_KEY_FIELDS = ("parser_kwargs", "component_settings")
TASK_PATH_ARGUMENTS = (
    "embedder_path",
    "parser_class_path",
    "component_class_path",
    "task_name",
    "post_processors",
)
TEXT_FIELDS = (
    ("corpuses", "Corpus", "preferred_embedder"),
    ("corpuses", "Corpus", "created_with_embedder"),
    ("annotations", "Embedding", "embedder_path"),
    ("annotations", "StructuralAnnotationSet", "parser_name"),
    ("analyzer", "Analyzer", "task_name"),
    ("extracts", "Column", "task_name"),
    ("django_celery_beat", "PeriodicTask", "task"),
)


def replace_prefix(value, old, new):
    if isinstance(value, str) and value.startswith(old):
        return new + value[len(old) :]
    return value


def replace_keys(value, old, new):
    """Move component keys while preserving all configuration/secret values."""
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        replacement = replace_prefix(key, old, new)
        if replacement in result:
            raise RuntimeError(
                "Component path migration found conflicting legacy and current "
                "keys; resolve the duplicate component configuration before retrying."
            )
        result[replacement] = item
    return result


def replace_paths(value, old, new):
    """Convert path containers; unrelated custom component names stay intact."""
    if isinstance(value, dict):
        return {
            key: replace_paths(item, old, new)
            for key, item in replace_keys(value, old, new).items()
        }
    if isinstance(value, list):
        return [replace_paths(item, old, new) for item in value]
    return replace_prefix(value, old, new)


def rekey_secrets(encrypted, old, new):
    if not encrypted:
        return encrypted
    salt_length = getattr(settings, "PIPELINE_SETTINGS_ENCRYPTION_SALT_LENGTH", 16)
    iterations = getattr(settings, "PIPELINE_SETTINGS_ENCRYPTION_ITERATIONS", 480000)

    def cipher(salt):
        key = hashlib.pbkdf2_hmac(
            "sha256", settings.SECRET_KEY.encode(), salt, iterations, dklen=32
        )
        return Fernet(base64.urlsafe_b64encode(key))

    raw = bytes(encrypted)
    try:
        original = json.loads(
            cipher(raw[:salt_length]).decrypt(raw[salt_length:]).decode("utf-8")
        )
    except Exception as exc:
        raise RuntimeError(
            "Cannot decrypt pipeline secrets for the component path migration. "
            "Restore the original DJANGO_SECRET_KEY and encryption settings; "
            "the migration will not replace unreadable credentials."
        ) from exc
    if not isinstance(original, dict):
        raise RuntimeError("Decrypted pipeline secrets must be a component mapping.")
    renamed = replace_keys(original, old, new)
    if renamed == original:
        return encrypted
    salt = os.urandom(salt_length)
    return salt + cipher(salt).encrypt(json.dumps(renamed).encode("utf-8"))


def migrate_paths(apps, schema_editor, old, new):
    alias = schema_editor.connection.alias
    PipelineSettings = apps.get_model("documents", "PipelineSettings")
    pipeline_fields = (*PIPELINE_PATH_FIELDS, *PIPELINE_KEY_FIELDS, "encrypted_secrets")
    for row in PipelineSettings.objects.using(alias).only(*pipeline_fields).iterator():
        updates = {}
        for field in PIPELINE_PATH_FIELDS:
            value = getattr(row, field)
            renamed = replace_paths(value, old, new)
            if renamed != value:
                updates[field] = renamed
        for field in PIPELINE_KEY_FIELDS:
            value = getattr(row, field)
            renamed = replace_keys(value, old, new)
            if renamed != value:
                updates[field] = renamed
        secrets = rekey_secrets(row.encrypted_secrets, old, new)
        if secrets != row.encrypted_secrets:
            updates["encrypted_secrets"] = secrets
        if updates:
            PipelineSettings.objects.using(alias).filter(pk=row.pk).update(**updates)

    for app_label, model_name, field in TEXT_FIELDS:
        model = apps.get_model(app_label, model_name)
        # SQL updates only the path column, never loading/rebuilding vectors.
        model.objects.using(alias).filter(**{f"{field}__startswith": old}).update(
            **{field: Concat(Value(new), Substr(F(field), len(old) + 1))}
        )

    for app_label, model_name in (("corpuses", "Corpus"), ("users", "UserExport")):
        model = apps.get_model(app_label, model_name)
        for row in model.objects.using(alias).only("post_processors").iterator():
            renamed = replace_paths(row.post_processors, old, new)
            if renamed != row.post_processors:
                model.objects.using(alias).filter(pk=row.pk).update(
                    post_processors=renamed
                )

    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    for row in PeriodicTask.objects.using(alias).only("kwargs").iterator():
        if old not in row.kwargs:
            continue
        original = json.loads(row.kwargs)
        # Positional args and arbitrary kwargs may contain user text or secrets.
        # Convert only named arguments whose contract identifies Python paths.
        renamed = {
            key: replace_paths(value, old, new) if key in TASK_PATH_ARGUMENTS else value
            for key, value in original.items()
        }
        if renamed != original:
            PeriodicTask.objects.using(alias).filter(pk=row.pk).update(
                kwargs=json.dumps(renamed)
            )
    # QuerySet.update bypasses the scheduler's save hook; force beat to reload.
    apps.get_model("django_celery_beat", "PeriodicTasks").objects.using(
        alias
    ).update_or_create(ident=1, defaults={"last_update": timezone.now()})
    # App initialization may have cached the pre-migration singleton.
    cache.delete("doclattice_pipeline_settings_singleton")


def forwards(apps, schema_editor):
    migrate_paths(apps, schema_editor, LEGACY_PREFIX, PACKAGE_PREFIX)
    migrate_export_formats(apps, schema_editor, EXPORT_FORMATS)


def backwards(apps, schema_editor):
    migrate_paths(apps, schema_editor, PACKAGE_PREFIX, LEGACY_PREFIX)
    migrate_export_formats(apps, schema_editor, [(new, old) for old, new in EXPORT_FORMATS])


def migrate_export_formats(apps, schema_editor, formats):
    """Update exact enum values so existing exports serialize through GraphQL."""
    UserExport = apps.get_model("users", "UserExport")
    for old, new in formats:
        UserExport.objects.using(schema_editor.connection.alias).filter(
            format=old
        ).update(format=new)


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0043_add_file_converter_support"),
        ("annotations", "0103_alter_authorityfrontier_authority_type_and_more"),
        ("corpuses", "0060_corpus_default_agent"),
        ("analyzer", "0023_source_permission_hot_path_indexes"),
        ("extracts", "0030_source_permission_hot_path_indexes"),
        ("users", "0031_systemstats"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
