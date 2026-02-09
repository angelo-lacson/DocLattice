from django.db import migrations, models

import doclatticeserver.types.enums


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0024_setup_telemetry_periodic_task"),
    ]

    operations = [
        migrations.AlterField(
            model_name="userexport",
            name="format",
            field=models.CharField(
                choices=[
                    ("LANGCHAIN", "LANGCHAIN"),
                    ("DOCLATTICE", "DOCLATTICE"),
                    ("DOCLATTICE_V2", "DOCLATTICE_V2"),
                    ("FUNSD", "FUNSD"),
                ],
                default=doclatticeserver.types.enums.ExportType["DOCLATTICE"],
                max_length=128,
            ),
        ),
    ]
