import django.db.models
from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("corpuses", "0045_corpusactiontemplate"),
    ]

    operations = [
        migrations.AlterField(
            model_name="corpusactiontemplate",
            name="creator",
            field=django.db.models.ForeignKey(
                blank=True,
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
