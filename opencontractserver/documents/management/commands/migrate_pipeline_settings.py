"""
Management command to migrate pipeline component settings to PipelineSettings database.

This command scans all registered pipeline components, extracts their Settings schemas,
reads current values from Django settings (using env_var metadata), and populates the
PipelineSettings singleton with the appropriate values.

Usage:
    python manage.py migrate_pipeline_settings --dry-run  # Show what would be migrated
    python manage.py migrate_pipeline_settings            # Perform migration
    python manage.py migrate_pipeline_settings --verify   # Verify all components configured
"""

import logging
from typing import Any

from django.conf import settings as django_settings
from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    """
    Migrate pipeline settings from Django settings to PipelineSettings database.

    This command:
    1. Scans all registered pipeline components
    2. Extracts their Settings schemas (if defined)
    3. Reads current values from Django settings (using env_var metadata)
    4. Populates PipelineSettings.component_settings and encrypted_secrets
    5. Reports any required settings that are missing
    """

    help = (
        "Migrate pipeline component settings from Django settings/env vars "
        "to PipelineSettings database"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be migrated without making changes",
        )
        parser.add_argument(
            "--verify",
            action="store_true",
            help="Verify all components have required settings configured",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show detailed information about each component",
        )
        parser.add_argument(
            "--component",
            type=str,
            help="Only migrate settings for a specific component (by class name or full path)",
        )

    def handle(self, *args, **options):
        """Execute the migration command."""
        dry_run = options["dry_run"]
        verify_only = options["verify"]
        verbose = options["verbose"]
        specific_component = options.get("component")

        self.stdout.write(self.style.NOTICE("\n" + "=" * 70))
        self.stdout.write(self.style.NOTICE("Pipeline Settings Migration"))
        self.stdout.write(self.style.NOTICE("=" * 70 + "\n"))

        if verify_only:
            self._verify_all_components(verbose)
            return

        # Import here to avoid circular imports
        from opencontractserver.documents.models import PipelineSettings
        from opencontractserver.pipeline.base.settings_schema import (
            get_secret_settings,
            get_settings_schema,
        )
        from opencontractserver.pipeline.registry import get_registry

        registry = get_registry()
        pipeline_settings = PipelineSettings.get_instance(use_cache=False)

        # Collect all components
        all_components = []
        all_components.extend(registry.parsers)
        all_components.extend(registry.embedders)
        all_components.extend(registry.thumbnailers)
        all_components.extend(registry.post_processors)

        # Filter to specific component if requested
        if specific_component:
            all_components = [
                c
                for c in all_components
                if c.name == specific_component or c.class_name == specific_component
            ]
            if not all_components:
                self.stdout.write(
                    self.style.ERROR(f"Component '{specific_component}' not found")
                )
                return

        self.stdout.write(f"Found {len(all_components)} pipeline components\n")

        # Track migration stats
        stats = {
            "total": len(all_components),
            "with_schema": 0,
            "settings_migrated": 0,
            "secrets_migrated": 0,
            "missing_required": [],
            "errors": [],
        }

        # Current settings from DB
        current_component_settings = dict(pipeline_settings.component_settings or {})
        current_secrets = pipeline_settings.get_secrets()

        for component_def in all_components:
            component_class = component_def.component_class
            if component_class is None:
                continue

            class_path = component_def.class_name
            schema = get_settings_schema(component_class)

            if not schema:
                if verbose:
                    self.stdout.write(
                        f"  {component_def.name}: No Settings schema defined"
                    )
                continue

            stats["with_schema"] += 1
            secret_settings = get_secret_settings(component_class)

            self.stdout.write(
                f"\n{component_def.name} ({component_def.component_type.value})"
            )
            self.stdout.write(f"  Class: {class_path}")
            self.stdout.write(
                f"  Settings: {len(schema)} total, {len(secret_settings)} secrets"
            )

            # Prepare settings dicts
            non_secret_settings: dict[str, Any] = {}
            component_secrets: dict[str, Any] = {}

            for setting_name, info in schema.items():
                env_var = info.get("env_var")
                default = info.get("default")
                is_secret = setting_name in secret_settings
                is_required = info.get("required", False)

                # Try to get current value from Django settings
                current_value = None
                if env_var:
                    current_value = getattr(django_settings, env_var, None)

                # Check existing DB value
                if class_path in current_component_settings:
                    db_value = current_component_settings[class_path].get(setting_name)
                    if db_value is not None:
                        current_value = db_value

                if is_secret and class_path in current_secrets:
                    db_secret = current_secrets[class_path].get(setting_name)
                    if db_secret is not None:
                        current_value = db_secret

                # Determine final value
                final_value = current_value if current_value is not None else default

                # Track missing required settings
                if is_required and (final_value is None or final_value == ""):
                    stats["missing_required"].append(
                        {
                            "component": class_path,
                            "setting": setting_name,
                            "env_var": env_var,
                        }
                    )
                    if verbose:
                        self.stdout.write(
                            self.style.WARNING(
                                f"    {setting_name}: MISSING (required)"
                            )
                        )
                    continue

                # Add to appropriate dict
                if is_secret:
                    if final_value is not None and final_value != "":
                        component_secrets[setting_name] = final_value
                        stats["secrets_migrated"] += 1
                        if verbose:
                            self.stdout.write(
                                f"    {setting_name}: [SECRET] {'(from env)' if env_var else '(default)'}"
                            )
                else:
                    if final_value is not None:
                        non_secret_settings[setting_name] = final_value
                        stats["settings_migrated"] += 1
                        if verbose:
                            display_value = (
                                final_value
                                if len(str(final_value)) < 50
                                else str(final_value)[:47] + "..."
                            )
                            self.stdout.write(f"    {setting_name}: {display_value}")

            # Store in DB (unless dry-run)
            if not dry_run:
                if non_secret_settings:
                    current_component_settings[class_path] = non_secret_settings

                if component_secrets:
                    if class_path not in current_secrets:
                        current_secrets[class_path] = {}
                    current_secrets[class_path].update(component_secrets)

        # Save to database
        if not dry_run:
            try:
                pipeline_settings.component_settings = current_component_settings
                if current_secrets:
                    pipeline_settings.set_secrets(current_secrets)
                pipeline_settings.save()
                self.stdout.write(
                    self.style.SUCCESS("\nSettings saved to database successfully")
                )
            except Exception as e:
                stats["errors"].append(str(e))
                self.stdout.write(self.style.ERROR(f"\nError saving settings: {e}"))
        else:
            self.stdout.write(
                self.style.NOTICE("\n[DRY RUN] No changes were made to the database")
            )

        # Print summary
        self._print_summary(stats, dry_run)

    def _verify_all_components(self, verbose: bool):
        """Verify all components have required settings configured."""
        from opencontractserver.documents.models import PipelineSettings
        from opencontractserver.pipeline.base.settings_schema import (
            get_required_settings,
            get_settings_schema,
        )
        from opencontractserver.pipeline.registry import get_registry

        registry = get_registry()
        pipeline_settings = PipelineSettings.get_instance(use_cache=False)

        all_components = []
        all_components.extend(registry.parsers)
        all_components.extend(registry.embedders)
        all_components.extend(registry.thumbnailers)
        all_components.extend(registry.post_processors)

        all_valid = True
        missing_by_component: dict[str, list[str]] = {}

        for component_def in all_components:
            component_class = component_def.component_class
            if component_class is None:
                continue

            class_path = component_def.class_name
            schema = get_settings_schema(component_class)

            if not schema:
                continue

            required_settings = get_required_settings(component_class)
            if not required_settings:
                if verbose:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  {component_def.name}: OK (no required settings)"
                        )
                    )
                continue

            # Get current settings from DB
            db_settings = pipeline_settings.get_full_component_settings(class_path)

            missing = []
            for setting_name in required_settings:
                value = db_settings.get(setting_name)
                if value is None or value == "":
                    missing.append(setting_name)

            if missing:
                all_valid = False
                missing_by_component[class_path] = missing
                self.stdout.write(
                    self.style.ERROR(
                        f"  {component_def.name}: MISSING {len(missing)} required settings"
                    )
                )
                if verbose:
                    for m in missing:
                        self.stdout.write(f"    - {m}")
            else:
                self.stdout.write(self.style.SUCCESS(f"  {component_def.name}: OK"))

        self.stdout.write("\n" + "=" * 70)
        if all_valid:
            self.stdout.write(self.style.SUCCESS("VERIFICATION PASSED"))
            self.stdout.write("All components have required settings configured")
        else:
            self.stdout.write(self.style.ERROR("VERIFICATION FAILED"))
            total_missing = sum(len(v) for v in missing_by_component.values())
            self.stdout.write(
                f"{len(missing_by_component)} components have "
                f"{total_missing} missing required settings"
            )
        self.stdout.write("=" * 70 + "\n")

        if not all_valid:
            raise SystemExit(1)

    def _print_summary(self, stats: dict, dry_run: bool):
        """Print migration summary."""
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write("MIGRATION SUMMARY")
        self.stdout.write("=" * 70)

        self.stdout.write(f"  Total components scanned: {stats['total']}")
        self.stdout.write(f"  Components with Settings schema: {stats['with_schema']}")
        self.stdout.write(
            f"  Non-secret settings migrated: {stats['settings_migrated']}"
        )
        self.stdout.write(f"  Secret settings migrated: {stats['secrets_migrated']}")

        if stats["missing_required"]:
            self.stdout.write(
                self.style.WARNING(
                    f"\n  Missing required settings: {len(stats['missing_required'])}"
                )
            )
            for missing in stats["missing_required"]:
                env_hint = (
                    f" (set {missing['env_var']})" if missing.get("env_var") else ""
                )
                self.stdout.write(
                    f"    - {missing['component']}.{missing['setting']}{env_hint}"
                )

        if stats["errors"]:
            self.stdout.write(self.style.ERROR(f"\n  Errors: {len(stats['errors'])}"))
            for error in stats["errors"]:
                self.stdout.write(f"    - {error}")

        if dry_run:
            self.stdout.write(
                self.style.NOTICE(
                    "\n  [DRY RUN] Run without --dry-run to apply changes"
                )
            )

        self.stdout.write("=" * 70 + "\n")
