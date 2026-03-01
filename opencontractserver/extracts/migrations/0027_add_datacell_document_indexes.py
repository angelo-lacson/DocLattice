# Generated migration for Datacell document indexes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("extracts", "0026_alter_column_backend_lock_and_more"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="datacell",
            index=models.Index(fields=["document"], name="extracts_da_documen_2ce84c_idx"),
        ),
        migrations.AddIndex(
            model_name="datacell",
            index=models.Index(
                fields=["document", "column"], name="extracts_da_documen_a86c47_idx"
            ),
        ),
    ]
