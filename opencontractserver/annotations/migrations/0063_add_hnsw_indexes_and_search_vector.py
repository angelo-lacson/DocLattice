"""
Add HNSW indexes on Embedding vector columns and SearchVectorField on Annotation.

This migration:
1. Creates HNSW indexes on all 7 Embedding vector columns for O(log n) ANN search
2. Adds a search_vector (tsvector) column to Annotation for full-text search
3. Creates a GIN index on search_vector for fast full-text lookups
4. Creates a database trigger to auto-populate search_vector on INSERT/UPDATE
5. Backfills search_vector for existing annotations

Uses AddIndexConcurrently for HNSW indexes to avoid locking tables during creation.
Requires atomic = False for concurrent index creation.
"""

import django.contrib.postgres.indexes
import django.contrib.postgres.search
import django.db.models
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations

from opencontractserver.constants.search import (
    FTS_CONFIG,
    HNSW_EF_CONSTRUCTION,
    HNSW_M,
)


class Migration(migrations.Migration):
    atomic = False  # Required for AddIndexConcurrently

    dependencies = [
        ("annotations", "0062_update_checkconstraint_check_to_condition"),
    ]

    operations = [
        # =================================================================
        # Phase 1: HNSW indexes on Embedding vector columns
        # =================================================================
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_384"],
                name="emb_hnsw_384",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_768"],
                name="emb_hnsw_768",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_1024"],
                name="emb_hnsw_1024",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_1536"],
                name="emb_hnsw_1536",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_2048"],
                name="emb_hnsw_2048",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_3072"],
                name="emb_hnsw_3072",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        AddIndexConcurrently(
            model_name="embedding",
            index=django.db.models.Index(
                fields=["vector_4096"],
                name="emb_hnsw_4096",
                opclasses=["vector_cosine_ops"],
            ),
        ),
        # =================================================================
        # Phase 2: SearchVectorField on Annotation
        # =================================================================
        migrations.AddField(
            model_name="annotation",
            name="search_vector",
            field=django.contrib.postgres.search.SearchVectorField(null=True),
        ),
        # GIN index for fast full-text search
        AddIndexConcurrently(
            model_name="annotation",
            index=django.contrib.postgres.indexes.GinIndex(
                fields=["search_vector"],
                name="annotation_search_vector_gin",
            ),
        ),
        # =================================================================
        # Phase 3: Database trigger to auto-populate search_vector
        # =================================================================
        migrations.RunSQL(
            sql=f"""
                CREATE OR REPLACE FUNCTION annotation_search_vector_update()
                RETURNS trigger AS $$
                BEGIN
                    NEW.search_vector :=
                        to_tsvector('{FTS_CONFIG}', COALESCE(NEW.raw_text, ''));
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER annotation_search_vector_trigger
                    BEFORE INSERT OR UPDATE OF raw_text
                    ON annotations_annotation
                    FOR EACH ROW
                    EXECUTE FUNCTION annotation_search_vector_update();
            """,
            reverse_sql="""
                DROP TRIGGER IF EXISTS annotation_search_vector_trigger
                    ON annotations_annotation;
                DROP FUNCTION IF EXISTS annotation_search_vector_update();
            """,
        ),
        # =================================================================
        # Phase 4: Backfill search_vector for existing annotations
        # =================================================================
        migrations.RunSQL(
            sql=f"""
                UPDATE annotations_annotation
                SET search_vector = to_tsvector('{FTS_CONFIG}', COALESCE(raw_text, ''))
                WHERE search_vector IS NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
