# Generated migration to remove corpus.documents M2M field
# Part of issue #835: Remove corpus.documents M2M relationship in favor of DocumentPath

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("corpuses", "0038_create_personal_corpuses"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="corpus",
            name="documents",
        ),
    ]
