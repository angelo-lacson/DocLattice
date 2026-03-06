from django.contrib.auth import get_user_model

from opencontractserver.corpuses.models import Corpus
from opencontractserver.tasks import fork_corpus
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.corpus_collector import collect_corpus_objects
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
    corpus_copy = Corpus.objects.get(pk=corpus_pk_to_fork)

    # Collect all object IDs using the shared collector
    collected = collect_corpus_objects(corpus_copy, include_metadata=True)

    # Clone the corpus: https://docs.djangoproject.com/en/3.1/topics/db/queries/copying-model-instances
    corpus_copy.pk = None
    corpus_copy.slug = ""  # Clear slug so save() generates a new unique one

    # Adjust the title to indicate it's a fork
    corpus_copy.title = f"[FORK] {corpus_copy.title}"
    # Lock corpus to tell frontend to show this as loading and disable selection
    corpus_copy.backend_lock = True
    corpus_copy.creator = user
    corpus_copy.parent_id = corpus_pk_to_fork
    corpus_copy.save()

    set_permissions_for_obj_to_user(user, corpus_copy, [PermissionTypes.CRUD])

    # Remove references to related objects on the new object, as these point to original docs and labels
    # Note: New forked corpus has no DocumentPath records yet, so no document cleanup needed
    corpus_copy.label_set = None

    # Copy docs, annotations, folders, relationships, and metadata using async task
    return fork_corpus.si(
        corpus_copy.id,
        collected.document_ids,
        collected.label_set_id,
        collected.annotation_ids,
        collected.folder_ids,
        collected.relationship_ids,
        user.id,
        collected.metadata_column_ids,
        collected.metadata_datacell_ids,
    )
