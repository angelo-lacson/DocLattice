from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class BadgesConfig(AppConfig):
    default_auto_field: str = "django.db.models.BigAutoField"
    name: str = "doclatticeserver.badges"
    verbose_name = _("Badges")

    def ready(self) -> None:
        """Import signal handlers when the app is ready."""
        import doclatticeserver.badges.signals  # noqa: F401
