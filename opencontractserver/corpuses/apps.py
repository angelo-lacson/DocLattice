from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CorpusesConfig(AppConfig):

    default_auto_field = "django.db.models.BigAutoField"
    name = "opencontractserver.corpuses"
    verbose_name = _("Corpuses")

    def ready(self):
        try:
            from django.db.models.signals import post_save

            from opencontractserver.corpuses.models import CorpusQuery
            from opencontractserver.corpuses.signals import run_query_on_create

            post_save.connect(run_query_on_create, sender=CorpusQuery)

        except ImportError:
            pass
