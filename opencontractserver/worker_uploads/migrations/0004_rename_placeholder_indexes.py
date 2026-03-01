from django.db import migrations


class Migration(migrations.Migration):
    """Rename indexes that were created with incorrect hand-crafted hash suffixes.

    Existing databases have the old placeholder names; fresh installs already
    have the correct names from 0001_initial.  ALTER INDEX IF EXISTS makes
    this a safe no-op on databases that already carry the correct names.
    """

    dependencies = [
        ("worker_uploads", "0003_hash_token_keys"),
    ]

    operations = [
        # WorkerAccount indexes
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_name_8c3b2d_idx" RENAME TO "worker_uplo_name_7f93db_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_name_7f93db_idx" RENAME TO "worker_uplo_name_8c3b2d_idx";',
        ),
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_is_acti_a1b2c3_idx" RENAME TO "worker_uplo_is_acti_f924a9_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_is_acti_f924a9_idx" RENAME TO "worker_uplo_is_acti_a1b2c3_idx";',
        ),
        # CorpusAccessToken indexes
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_worker__d4e5f6_idx" RENAME TO "worker_uplo_worker__316c0e_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_worker__316c0e_idx" RENAME TO "worker_uplo_worker__d4e5f6_idx";',
        ),
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_is_acti_g7h8i9_idx" RENAME TO "worker_uplo_is_acti_73f6ba_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_is_acti_73f6ba_idx" RENAME TO "worker_uplo_is_acti_g7h8i9_idx";',
        ),
        # WorkerDocumentUpload indexes
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_status_j1k2l3_idx" RENAME TO "worker_uplo_status_a9c908_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_status_a9c908_idx" RENAME TO "worker_uplo_status_j1k2l3_idx";',
        ),
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_corpus__m4n5o6_idx" RENAME TO "worker_uplo_corpus__ecd8cb_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_corpus__ecd8cb_idx" RENAME TO "worker_uplo_corpus__m4n5o6_idx";',
        ),
        migrations.RunSQL(
            sql='ALTER INDEX IF EXISTS "worker_uplo_corpus__p7q8r9_idx" RENAME TO "worker_uplo_corpus__c75c7b_idx";',
            reverse_sql='ALTER INDEX IF EXISTS "worker_uplo_corpus__c75c7b_idx" RENAME TO "worker_uplo_corpus__p7q8r9_idx";',
        ),
    ]
