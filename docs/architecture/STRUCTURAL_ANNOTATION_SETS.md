# Structural Annotation Sets Architecture

## Executive Summary

Structural annotations (headers, sections, paragraphs, etc.) are immutable document structure elements created during parsing. In our corpus isolation model, these should be **shared** across all corpus-isolated copies of a document, not duplicated. This document outlines a new architecture using `StructuralAnnotationSet` to achieve this efficiency.

## Problem Statement

### Current Issues
1. **Duplication Problem**: With corpus isolation, each corpus gets its own Document copy. Copying thousands of structural annotations per document is wasteful.
2. **Conceptual Incorrectness**: Structural annotations represent the document's inherent structure - they should be identical across all copies.
3. **Performance Impact**: Copying annotations during `import_document` adds latency and database bloat.
4. **Query Complexity**: Frontend and backend must query annotations from multiple sources.

### Current Broken State
- `import_document` creates corpus-isolated documents but does NOT copy structural annotations
- Documents in corpuses start with NO structural annotations
- Frontend queries expecting structural annotations on documents fail

## Proposed Solution: StructuralAnnotationSet

### Core Concept
Separate structural annotations from document instances. Create a shared `StructuralAnnotationSet` that multiple Document objects reference.

### Data Model

```python
class StructuralAnnotationSet(models.Model):
    """
    Immutable set of structural annotations for a specific document content.
    Multiple Document instances can reference the same set.
    """
    # Unique identifier based on content
    content_hash = models.CharField(max_length=64, unique=True, db_index=True)

    # Version tree if structural annotations evolve with versions
    version_tree_id = models.UUIDField(null=True, blank=True, db_index=True)

    # Metadata
    created = models.DateTimeField(auto_now_add=True)
    parser_name = models.CharField(max_length=255, null=True)
    parser_version = models.CharField(max_length=50, null=True)
    page_count = models.IntegerField(null=True)
    token_count = models.IntegerField(null=True)

    # PAWLS data for PDFs
    pawls_parse_file = models.FileField(
        upload_to="pawls/",
        storage=PrivateMediaStorage(),
        null=True,
        blank=True
    )

    class Meta:
        indexes = [
            models.Index(fields=['content_hash']),
            models.Index(fields=['version_tree_id']),
        ]


class Document(models.Model):
    # Existing fields...

    # NEW: Reference to shared structural annotations
    structural_annotation_set = models.ForeignKey(
        StructuralAnnotationSet,
        on_delete=models.PROTECT,  # Never delete if documents reference it
        null=True,
        blank=True,
        related_name='documents',
        help_text="Shared structural annotations for this document's content"
    )


class Annotation(models.Model):
    # CHANGED: Make document optional for structural annotations
    document = models.ForeignKey(
        Document,
        null=True,
        blank=True,
        on_delete=models.CASCADE
    )

    # NEW: Link to structural set
    structural_set = models.ForeignKey(
        StructuralAnnotationSet,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='annotations',
        help_text="For structural annotations shared across documents"
    )

    # Corpus field remains for corpus-specific annotations
    corpus = models.ForeignKey(
        Corpus,
        null=True,
        blank=True,
        on_delete=models.CASCADE
    )

    # Constraint: Must have EITHER document OR structural_set
    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(document__isnull=False, structural_set__isnull=True) |
                    models.Q(document__isnull=True, structural_set__isnull=False)
                ),
                name='annotation_has_single_parent'
            )
        ]
```

### Relationships Between Structural Annotations

```python
class Relationship(models.Model):
    # Existing fields...

    # NEW: Link to structural set if both annotations are structural
    structural_set = models.ForeignKey(
        StructuralAnnotationSet,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='relationships',
        help_text="For relationships between structural annotations"
    )
```

## Implementation Changes Required

### 1. Backend: Parser Integration

**File**: `opencontractserver/pipeline/parsers/base_parser.py`

```python
def parse_document(content: bytes, content_hash: str, parser_class) -> StructuralAnnotationSet:
    """
    Parse document and create/retrieve structural annotation set.
    """
    # Check if already parsed
    annotation_set, created = StructuralAnnotationSet.objects.get_or_create(
        content_hash=content_hash,
        defaults={
            'parser_name': parser_class.__name__,
            'parser_version': parser_class.VERSION
        }
    )

    if not created:
        # Already parsed, return existing
        logger.info(f"Using existing structural annotations for hash {content_hash}")
        return annotation_set

    # Parse document
    pawls_data = parser_class.parse(content)

    # Store PAWLS file
    annotation_set.pawls_parse_file.save(
        f"{content_hash}.json",
        ContentFile(json.dumps(pawls_data))
    )

    # Create structural annotations
    for token in pawls_data.get('tokens', []):
        Annotation.objects.create(
            structural_set=annotation_set,
            structural=True,
            raw_text=token['text'],
            json_data={'bounds': token['bounds']},
            annotation_label=get_or_create_label(token['type']),
            # No document or corpus - these are content-level
        )

    # Create relationships between structural annotations
    for relationship in pawls_data.get('relationships', []):
        Relationship.objects.create(
            structural_set=annotation_set,
            source_annotations=[...],  # Link to structural annotations
            target_annotations=[...],
        )

    return annotation_set
```

### 2. Backend: Corpus Import

**File**: `opencontractserver/documents/versioning.py`

```python
def import_document(corpus, path, content, user, folder=None, **doc_kwargs):
    """
    Import document with shared structural annotations.
    """
    content_hash = compute_sha256_hash(content)

    # Parse or retrieve structural annotations (shared)
    structural_set = parse_document(content, content_hash, get_parser_for_content(content))

    # Check for existing document in THIS corpus
    existing_in_corpus = DocumentPath.objects.filter(
        corpus=corpus,
        document__pdf_file_hash=content_hash,
        is_current=True,
        is_deleted=False
    ).first()

    if existing_in_corpus:
        # Handle update/unchanged cases
        # ...

    # Create corpus-isolated document
    corpus_copy = Document.objects.create(
        pdf_file_hash=content_hash,
        structural_annotation_set=structural_set,  # Reference shared set!
        version_tree_id=uuid.uuid4(),
        is_current=True,
        **doc_kwargs
    )

    # Create DocumentPath
    path_record = DocumentPath.objects.create(
        document=corpus_copy,
        corpus=corpus,
        path=path or f"/documents/{corpus_copy.title}",
        folder=folder,
        version_number=1,
        is_current=True,
        is_deleted=False,
    )

    return corpus_copy, 'created', path_record
```

### 3. Backend: Annotation Query Optimizer

**File**: `opencontractserver/annotations/query_optimizer.py`

```python
class AnnotationQueryOptimizer:
    @staticmethod
    def get_document_annotations(document_id, user=None, corpus_id=None):
        """
        Get all annotations for a document (structural + corpus-specific).
        """
        document = Document.objects.get(pk=document_id)

        # Get structural annotations via the set
        structural_qs = Annotation.objects.none()
        if document.structural_annotation_set:
            structural_qs = Annotation.objects.filter(
                structural_set=document.structural_annotation_set,
                structural=True
            )

        # Get corpus-specific annotations
        corpus_qs = Annotation.objects.filter(
            document_id=document_id,
            structural=False
        )

        if corpus_id:
            corpus_qs = corpus_qs.filter(corpus_id=corpus_id)

        # Combine and apply permissions
        combined = structural_qs | corpus_qs

        if user:
            combined = combined.visible_to_user(user)

        return combined.distinct()
```

### 4. GraphQL Schema Updates

**File**: `config/graphql/graphene_types.py`

```python
class DocumentType(DjangoObjectType):
    # Existing fields...

    structural_annotations = graphene.List(AnnotationType)
    corpus_annotations = graphene.List(AnnotationType)

    def resolve_structural_annotations(self, info):
        """Resolve structural annotations via the shared set."""
        if not self.structural_annotation_set:
            return []

        return Annotation.objects.filter(
            structural_set=self.structural_annotation_set
        ).visible_to_user(info.context.user)

    def resolve_corpus_annotations(self, info):
        """Resolve corpus-specific annotations."""
        corpus_id = info.context.corpus_id  # From context or query param

        return Annotation.objects.filter(
            document=self,
            corpus_id=corpus_id,
            structural=False
        ).visible_to_user(info.context.user)

    def resolve_doc_annotations(self, info):
        """
        Combined resolver for backward compatibility.
        Returns both structural and corpus annotations.
        """
        structural = self.resolve_structural_annotations(info)
        corpus = self.resolve_corpus_annotations(info)

        # Combine and return
        return list(structural) + list(corpus)


class AnnotationType(DjangoObjectType):
    # Existing fields...

    is_structural = graphene.Boolean()

    def resolve_is_structural(self, info):
        """Determine if this is a structural annotation."""
        return self.structural_set_id is not None
```

### 5. Frontend Query Updates

**File**: `frontend/src/graphql/queries/documentQueries.ts`

```typescript
// OLD QUERY (will break)
export const GET_DOCUMENT_ANNOTATIONS = gql`
  query GetDocumentAnnotations($documentId: ID!) {
    document(id: $documentId) {
      docAnnotations {
        edges {
          node {
            id
            rawText
            structural
          }
        }
      }
    }
  }
`;

// NEW QUERY (explicit separation)
export const GET_DOCUMENT_ANNOTATIONS_V2 = gql`
  query GetDocumentAnnotations($documentId: ID!, $corpusId: ID) {
    document(id: $documentId) {
      # Structural annotations (shared across corpuses)
      structuralAnnotations {
        id
        rawText
        jsonData
        annotationLabel {
          text
          labelType
        }
      }

      # Corpus-specific annotations
      corpusAnnotations(corpusId: $corpusId) {
        id
        rawText
        jsonData
        isPublic
        creator {
          username
        }
      }

      # Combined for backward compatibility
      docAnnotations {
        edges {
          node {
            id
            rawText
            structural
            isStructural  # NEW field
          }
        }
      }
    }
  }
`;
```

**File**: `frontend/src/components/annotator/DocumentAnnotator.tsx`

```typescript
// Component updates to handle separated annotations
const DocumentAnnotator: React.FC<Props> = ({ documentId, corpusId }) => {
  const { data, loading, error } = useQuery(GET_DOCUMENT_ANNOTATIONS_V2, {
    variables: { documentId, corpusId },
  });

  // Combine annotations for display
  const allAnnotations = useMemo(() => {
    if (!data?.document) return [];

    const structural = data.document.structuralAnnotations || [];
    const corpusSpecific = data.document.corpusAnnotations || [];

    return [
      ...structural.map(a => ({ ...a, isStructural: true })),
      ...corpusSpecific.map(a => ({ ...a, isStructural: false })),
    ];
  }, [data]);

  // Rest of component...
};
```

### 6. Migration Strategy

#### Phase 1: Add New Models (Non-breaking)
```python
# Migration 0026_add_structural_annotation_sets.py
class Migration(migrations.Migration):
    operations = [
        migrations.CreateModel(
            name='StructuralAnnotationSet',
            fields=[
                ('id', models.AutoField(primary_key=True)),
                ('content_hash', models.CharField(max_length=64, unique=True)),
                # ... other fields
            ],
        ),
        migrations.AddField(
            model_name='document',
            name='structural_annotation_set',
            field=models.ForeignKey(null=True, blank=True, ...),
        ),
        migrations.AddField(
            model_name='annotation',
            name='structural_set',
            field=models.ForeignKey(null=True, blank=True, ...),
        ),
    ]
```

#### Phase 2: Data Migration
```python
# Migration 0027_migrate_structural_annotations.py
def migrate_structural_annotations(apps, schema_editor):
    Document = apps.get_model('documents', 'Document')
    Annotation = apps.get_model('annotations', 'Annotation')
    StructuralAnnotationSet = apps.get_model('annotations', 'StructuralAnnotationSet')

    # Group documents by content hash
    for content_hash in Document.objects.values_list('pdf_file_hash', flat=True).distinct():
        if not content_hash:
            continue

        # Create structural annotation set
        struct_set = StructuralAnnotationSet.objects.create(
            content_hash=content_hash
        )

        # Find the first document with this hash that has structural annotations
        source_doc = Document.objects.filter(
            pdf_file_hash=content_hash
        ).first()

        if source_doc:
            # Migrate structural annotations to the set
            structural_annots = Annotation.objects.filter(
                document=source_doc,
                structural=True
            )

            for annot in structural_annots:
                annot.structural_set = struct_set
                annot.document = None  # Remove document link
                annot.save()

            # Update all documents with this hash to reference the set
            Document.objects.filter(
                pdf_file_hash=content_hash
            ).update(
                structural_annotation_set=struct_set
            )
```

#### Phase 3: Update Queries (Breaking changes)
- Deploy updated GraphQL resolvers
- Deploy updated frontend with new queries
- Monitor for errors

## Affected Files Checklist

### Backend
- [ ] `opencontractserver/annotations/models.py` - Add StructuralAnnotationSet model
- [ ] `opencontractserver/documents/models.py` - Add structural_annotation_set FK
- [ ] `opencontractserver/documents/versioning.py` - Update import_document
- [ ] `opencontractserver/corpuses/models.py` - Update add_document, import_content
- [ ] `opencontractserver/annotations/query_optimizer.py` - Update query methods
- [ ] `opencontractserver/annotations/signals.py` - Update process_structural_annotation_for_corpuses
- [ ] `opencontractserver/pipeline/parsers/base_parser.py` - Create annotation sets
- [ ] `opencontractserver/pipeline/parsers/nlm_ingest_parser.py` - Use annotation sets
- [ ] `opencontractserver/pipeline/parsers/docling_parser.py` - Use annotation sets
- [ ] `config/graphql/graphene_types.py` - Add new resolvers
- [ ] `opencontractserver/shared/QuerySets.py` - Update annotation visibility queries
- [ ] `opencontractserver/llms/vector_stores/core_vector_stores.py` - Handle structural set

### Frontend
- [ ] `frontend/src/graphql/queries/documentQueries.ts` - New annotation queries
- [ ] `frontend/src/components/annotator/DocumentAnnotator.tsx` - Handle separated annotations
- [ ] `frontend/src/components/annotator/AnnotationList.tsx` - Display structural vs corpus
- [ ] `frontend/src/components/widgets/AnnotationCards.tsx` - Update annotation source
- [ ] `frontend/src/components/extracts/ExtractList.tsx` - Query updates
- [ ] `frontend/src/hooks/useAnnotations.tsx` - Combine structural + corpus
- [ ] `frontend/src/views/documents/DocumentView.tsx` - Pass corpus context

### Tests to Update
- [ ] `test_structural_annotations_follow_document_versions` - Use annotation sets
- [ ] `test_structural_annotation_is_read_only` - Verify immutability via sets
- [ ] `test_process_structural_annotation_for_corpuses` - Use DocumentPath
- [ ] `test_structural_annotations_always_visible` - Test shared visibility
- [ ] All parser tests - Create annotation sets

## Benefits

1. **Efficiency**: Parse once, reference everywhere
2. **Correctness**: Structural annotations truly shared across corpus boundaries
3. **Performance**: No copying thousands of annotations
4. **Storage**: Similar to file deduplication, but for annotations
5. **Immutability**: Structural annotations protected from corpus-specific changes
6. **Clarity**: Clear separation between document structure and corpus content

## Risks and Mitigations

### Risk 1: Breaking Frontend Queries
**Mitigation**: Provide backward-compatible `docAnnotations` resolver during transition

### Risk 2: Large Migration
**Mitigation**: Migrate in phases, test thoroughly on staging

### Risk 3: Performance of Combined Queries
**Mitigation**: Add database indexes, consider materialized views for hot paths

## Timeline

- **Week 1**: Create models and migrations
- **Week 2**: Update parsers and import logic
- **Week 3**: Update GraphQL and query optimizers
- **Week 4**: Frontend updates and testing
- **Week 5**: Data migration and deployment

## Success Criteria

1. Documents with same content share structural annotations
2. No duplication of structural annotations in database
3. Frontend displays both structural and corpus annotations correctly
4. Performance improvement in document import
5. All tests pass with new architecture

---

*This architecture ensures structural annotations (document structure) properly travel with documents across corpuses while maintaining corpus isolation for user-created content.*