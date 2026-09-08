"""Record the existing embedder help text; no database column changes."""

from django.db import migrations

from doclatticeserver.shared.fields import NullableJSONField


class Migration(migrations.Migration):
    dependencies = [("documents", "0044_rebrand_component_paths")]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name="pipelinesettings",
                    name="preferred_embedders",
                    field=NullableJSONField(
                        blank=True,
                        default=dict,
                        help_text="Mapping of MIME types to preferred embedder class paths. "
                        "API-only: has no effect at ingest, which always resolves the "
                        "single global default_embedder (issue #2114).",
                    ),
                ),
            ],
        ),
    ]
