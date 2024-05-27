from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class CorpusesConfig(AppConfig):

    default_auto_field = "django.db.models.BigAutoField"
    name = "doclatticeserver.corpuses"
    verbose_name = _("Corpuses")

    def ready(self):
        try:
            import doclatticeserver.corpuses.signals  # noqa F401
        except ImportError:
            pass
