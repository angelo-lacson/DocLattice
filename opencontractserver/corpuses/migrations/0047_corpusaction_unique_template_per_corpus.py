from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("corpuses", "0046_corpusaction_source_template"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="corpusaction",
            constraint=models.UniqueConstraint(
                condition=models.Q(source_template__isnull=False),
                fields=["corpus", "source_template"],
                name="unique_template_per_corpus",
            ),
        ),
    ]
