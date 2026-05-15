from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class AgentsConfig(AppConfig):
    default_auto_field: str = "django.db.models.BigAutoField"
    name: str = "doclatticeserver.agents"
    verbose_name = _("Agents")

    def ready(self) -> None:
        # Register Django system checks for agent-tool configuration
        # (e.g. privacy-filter API key visibility).
        from doclatticeserver.agents import checks  # noqa: F401
