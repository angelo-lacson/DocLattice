import uuid

from django.apps import AppConfig
from django.db.models.signals import post_save
from django.utils.translation import gettext_lazy as _


class CorpusesConfig(AppConfig):

    default_auto_field = "django.db.models.BigAutoField"
    name = "doclatticeserver.corpuses"
    verbose_name = _("Corpuses")

    def ready(self):
        try:
            import doclatticeserver.corpuses.signals  # noqa F401
            from doclatticeserver.corpuses.models import CorpusQuery
            from doclatticeserver.corpuses.signals import (
                run_query_on_create,
            )

            # DOCUMENT SIGNALS #########################################################################################
            # When a new query is created, queue task to run query.
            post_save.connect(
                run_query_on_create, sender=CorpusQuery, dispatch_uid=uuid.uuid4()
            )
        except ImportError:
            pass
