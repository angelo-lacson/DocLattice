from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CorpusesConfig(AppConfig):

    default_auto_field = "django.db.models.BigAutoField"
    name = "opencontractserver.corpuses"
    verbose_name = _("Corpuses")

    def ready(self):
        try:
            # Import signals to register signal handlers for corpus actions
            # This enables automatic triggering of corpus actions when documents
            # are added to a corpus via the M2M relationship
            from opencontractserver.corpuses import signals  # noqa: F401

        except ImportError:
            pass
