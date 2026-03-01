from django.db import migrations

import opencontractserver.shared.fields


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


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0034_update_checkconstraint_check_to_condition"),
    ]

    operations = [
        migrations.AddField(
            model_name="pipelinesettings",
            name="enabled_components",
            field=opencontractserver.shared.fields.NullableJSONField(
                blank=True,
                default=list,
                help_text="List of enabled component class paths. Empty list means all components are enabled.",
            ),
        ),
        migrations.RunPython(
            populate_enabled_components,
            migrations.RunPython.noop,
        ),
    ]
