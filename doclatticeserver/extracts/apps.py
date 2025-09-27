from django.apps import AppConfig


class ExtractsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "doclatticeserver.extracts"

    def ready(self):
        try:
            from . import signals

        except ImportError:
            pass
