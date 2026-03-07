import importlib

from django.apps import apps
from django.core.management.base import BaseCommand

# Migration module name starts with a digit, so we must use importlib.
_migration_mod = importlib.import_module(
    "opencontractserver.agents.migrations.0010_create_default_action_templates"
)
_create_default_action_templates = _migration_mod.create_default_action_templates


class Command(BaseCommand):
    help = (
        "Seed default CorpusActionTemplates and their AgentConfigurations. "
        "Safe to run multiple times — existing templates are skipped."
    )

    def handle(self, *args, **options):
        _create_default_action_templates(apps, None)
        self.stdout.write(self.style.SUCCESS("Default action templates seeded."))
