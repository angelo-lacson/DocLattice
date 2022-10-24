from config import celery_app
from doclatticeserver.utils.data_types import LabelLookupPythonType
from doclatticeserver.utils.etl_utils import build_label_lookups


@celery_app.task()
def build_label_lookups_task(corpus_id: str) -> LabelLookupPythonType:
    return build_label_lookups(corpus_id=corpus_id)
