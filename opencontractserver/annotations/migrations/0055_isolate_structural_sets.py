"""
Data migration to isolate shared StructuralAnnotationSets.

Before this migration, StructuralAnnotationSets could be shared across multiple
documents (including documents in different corpuses). This caused issues with
per-corpus embeddings since different corpuses may use different embedders with
incompatible vector dimensions.

This migration finds all StructuralAnnotationSets that are shared by multiple
documents and duplicates them so each document has its own isolated copy.
The first document keeps the original set; subsequent documents get copies.
"""

from django.db import migrations
from django.db.models import Count


def isolate_structural_annotation_sets(apps, schema_editor):
    """
    Find all StructuralAnnotationSets shared by multiple documents and
    duplicate them so each document has its own isolated copy.
    """
    Document = apps.get_model("documents", "Document")
    StructuralAnnotationSet = apps.get_model("annotations", "StructuralAnnotationSet")
    Annotation = apps.get_model("annotations", "Annotation")

    # Find structural sets used by more than one document
    shared_sets = (
        StructuralAnnotationSet.objects.annotate(doc_count=Count("document")).filter(
            doc_count__gt=1
        )
    )

    total_duplicated = 0

    for struct_set in shared_sets:
        docs = list(Document.objects.filter(structural_annotation_set=struct_set))
        if len(docs) <= 1:
            continue

        # First document keeps original, rest get copies
        for doc in docs[1:]:
            # Create new set for this document with unique content_hash
            new_set = StructuralAnnotationSet.objects.create(
                content_hash=f"{struct_set.content_hash}_{doc.pk}",
                parser_name=struct_set.parser_name,
                parser_version=struct_set.parser_version,
                page_count=struct_set.page_count,
                token_count=struct_set.token_count,
                pawls_parse_file=struct_set.pawls_parse_file,
                txt_extract_file=struct_set.txt_extract_file,
                is_public=struct_set.is_public,
                creator_id=struct_set.creator_id,
            )

            # Copy all structural annotations (without embeddings)
            original_annotations = Annotation.objects.filter(structural_set=struct_set)
            new_annotations = [
                Annotation(
                    structural_set=new_set,
                    page=a.page,
                    raw_text=a.raw_text,
                    tokens_jsons=a.tokens_jsons,
                    bounding_box=a.bounding_box,
                    json=a.json,
                    annotation_type=a.annotation_type,
                    annotation_label_id=a.annotation_label_id,
                    structural=True,
                    content_modalities=a.content_modalities,
                    is_public=a.is_public,
                    creator_id=a.creator_id,
                )
                for a in original_annotations
            ]
            Annotation.objects.bulk_create(new_annotations)

            # Update document to point to new set
            doc.structural_annotation_set = new_set
            doc.save(update_fields=["structural_annotation_set"])

            total_duplicated += 1
            print(
                f"  Isolated structural set for document {doc.pk}: "
                f"old={struct_set.pk} -> new={new_set.pk}"
            )

    if total_duplicated > 0:
        print(f"Isolated {total_duplicated} shared structural annotation sets")
    else:
        print("No shared structural annotation sets found to isolate")


def reverse_migration(apps, schema_editor):
    """
    Reverse is not practical - would require identifying which sets were
    originally shared. Leave as-is on reverse.
    """
    print(
        "Note: Reverse migration is a no-op. "
        "Duplicated structural sets will remain isolated."
    )


class Migration(migrations.Migration):
    dependencies = [
        ("annotations", "0054_add_content_modalities_gin_index"),
        ("documents", "0048_document_structural_annotation_set"),
    ]

    operations = [
        migrations.RunPython(
            isolate_structural_annotation_sets,
            reverse_migration,
        ),
    ]
