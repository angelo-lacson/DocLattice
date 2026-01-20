from django.contrib.auth import get_user_model

from opencontractserver.annotations.models import Annotation, Relationship
from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.tasks import fork_corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


def build_fork_corpus_task(corpus_pk_to_fork: str, user: User):
    """
    Build a Celery task to fork a corpus.

    This collects all necessary IDs and creates a new corpus shell,
    then returns a Celery task signature ready to be executed.

    Args:
        corpus_pk_to_fork: Primary key of the corpus to fork
        user: User who will own the forked corpus

    Returns:
        Celery task signature for fork_corpus
    """
    # Get corpus obj
    corpus_copy = Corpus.objects.get(pk=corpus_pk_to_fork)

    # Collect annotation IDs (user annotations only, not analysis-generated)
    annotation_ids = list(
        Annotation.objects.filter(
            corpus_id=corpus_pk_to_fork,
            analysis__isnull=True,
        ).values_list("id", flat=True)
    )

    # Get ids to related objects that need copyin'
    # Use get_documents() to respect DocumentPath soft-deletes
    doc_ids = list(corpus_copy.get_documents().values_list("id", flat=True))
    label_set_id = corpus_copy.label_set.pk if corpus_copy.label_set else None

    # Collect folder IDs (in tree order for proper parent mapping)
    # Note: with_tree_fields() provides default tree_ordering which ensures parents before children
    folder_ids = list(
        CorpusFolder.objects.filter(corpus_id=corpus_pk_to_fork)
        .with_tree_fields()
        .values_list("id", flat=True)
    )

    # Collect relationship IDs (user relationships only, not analysis-generated)
    relationship_ids = list(
        Relationship.objects.filter(
            corpus_id=corpus_pk_to_fork,
            analysis__isnull=True,
        ).values_list("id", flat=True)
    )

    # Clone the corpus: https://docs.djangoproject.com/en/3.1/topics/db/queries/copying-model-instances
    corpus_copy.pk = None
    corpus_copy.slug = ""  # Clear slug so save() generates a new unique one

    # Adjust the title to indicate it's a fork
    corpus_copy.title = f"[FORK] {corpus_copy.title}"
    corpus_copy.backend_lock = True  # lock corpus to tell frontend to show this as loading and disable selection
    corpus_copy.creator = user  # switch the creator to the current user
    corpus_copy.parent_id = corpus_pk_to_fork
    corpus_copy.save()

    set_permissions_for_obj_to_user(user, corpus_copy, [PermissionTypes.CRUD])

    # Now remove references to related objects on our new object, as these point to original docs and labels
    corpus_copy.documents.clear()
    corpus_copy.label_set = None

    # Copy docs, annotations, folders, and relationships using async task
    return fork_corpus.si(
        corpus_copy.id,
        doc_ids,
        label_set_id,
        annotation_ids,
        folder_ids,
        relationship_ids,
        user.id,
    )
