from django.db import migrations


class Migration(migrations.Migration):
    """Rename indexes that were created with incorrect hand-crafted hash suffixes.

    Existing databases have the old placeholder names; fresh installs already
    have the correct names from 0027_add_datacell_document_indexes.
    ALTER INDEX IF EXISTS makes this a safe no-op on databases that already
    carry the correct names.
    """

    dependencies = [
        ("extracts", "0027_add_datacell_document_indexes"),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "extracts_da_documen_b8c4f5_idx" RENAME TO "extracts_da_documen_2ce84c_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "extracts_da_documen_2ce84c_idx" RENAME TO "extracts_da_documen_b8c4f5_idx";',
        ),
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "extracts_da_documen_7f2e3a_idx" RENAME TO "extracts_da_documen_a86c47_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "extracts_da_documen_a86c47_idx" RENAME TO "extracts_da_documen_7f2e3a_idx";',
        ),
    ]
