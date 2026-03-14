"""Remove dead fields tokens_jsons and bounding_box from Annotation model.

These fields were redundant with the ``json`` field which stores all
annotation positioning data (bounds, token references) in a structured
per-page format.  Neither field was read or populated by any code path
in production (parsers, export, import, GraphQL, frontend).
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("annotations", "0065_add_corpus_action_index"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="annotation",
            name="tokens_jsons",
        ),
        migrations.RemoveField(
            model_name="annotation",
            name="bounding_box",
        ),
    ]
