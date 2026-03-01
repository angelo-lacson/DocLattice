from django.db import migrations


class Migration(migrations.Migration):
    """Rename index that was created with an incorrect hand-crafted hash suffix.

    Existing databases have the old placeholder name; fresh installs already
    have the correct name from 0037_add_is_personal_corpus.  ALTER INDEX IF
    EXISTS makes this a safe no-op on databases that already carry the correct
    name.
    """

    dependencies = [
        ("corpuses", "0043_alter_corpus_preferred_embedder_and_more"),
        ("corpuses", "0043_backfill_corpus_slugs"),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "corpuses_co_creator_0e8c8f_idx" RENAME TO "corpuses_co_creator_c32eb3_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "corpuses_co_creator_c32eb3_idx" RENAME TO "corpuses_co_creator_0e8c8f_idx";',
        ),
    ]
