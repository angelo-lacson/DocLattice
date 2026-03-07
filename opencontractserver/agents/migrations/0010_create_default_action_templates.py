# Generated manually for data migration

from django.db import migrations

from opencontractserver.corpuses.template_seeds import (
    create_default_action_templates,
    reverse_migration,
)


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0009_update_checkconstraint_check_to_condition"),
        ("corpuses", "0045_corpusactiontemplate"),
    ]

    operations = [
        migrations.RunPython(
            create_default_action_templates,
            reverse_migration,
        ),
    ]
