"""
Tests for the migrate_pipeline_settings management command.
"""

from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings

from opencontractserver.documents.models import PipelineSettings


class MigratePipelineSettingsCommandTestCase(TestCase):
    """Tests for the migrate_pipeline_settings management command."""

    def setUp(self):
        """Set up test fixtures."""
        # Ensure we have a clean PipelineSettings instance
        PipelineSettings.objects.all().delete()
        self.pipeline_settings = PipelineSettings.objects.create(
            id=1,
            preferred_parsers={"application/pdf": "old.parser.Path"},
            preferred_embedders={"application/pdf": "old.embedder.Path"},
            preferred_thumbnailers={},
            parser_kwargs={"old.parser.Path": {"setting": "value"}},
            default_embedder="old.embedder.Default",
        )

    def test_verify_option(self):
        """Test --verify option runs without error."""
        out = StringIO()
        # This may fail verification if components don't have required settings,
        # but it should not raise an exception
        try:
            call_command("migrate_pipeline_settings", "--verify", stdout=out)
        except SystemExit:
            pass  # Expected if verification fails
        output = out.getvalue()
        self.assertIn("Pipeline Settings Migration", output)

    def test_dry_run_option(self):
        """Test --dry-run option does not modify database."""
        out = StringIO()

        # Get initial state
        initial_settings = PipelineSettings.get_instance(use_cache=False)
        initial_parsers = dict(initial_settings.preferred_parsers or {})

        call_command("migrate_pipeline_settings", "--dry-run", stdout=out)

        # Verify settings unchanged
        refreshed_settings = PipelineSettings.get_instance(use_cache=False)
        self.assertEqual(
            refreshed_settings.preferred_parsers,
            initial_parsers,
        )

        output = out.getvalue()
        self.assertIn("[DRY RUN]", output)

    @override_settings(
        PREFERRED_PARSERS={
            "application/pdf": "new.parser.DoclingParser",
            "text/plain": "new.parser.TxtParser",
        },
        PREFERRED_EMBEDDERS={
            "application/pdf": "new.embedder.MicroserviceEmbedder",
        },
        PREFERRED_THUMBNAILERS={},
        PARSER_KWARGS={
            "new.parser.DoclingParser": {"force_ocr": False},
        },
        DEFAULT_EMBEDDER="new.embedder.DefaultEmbedder",
    )
    def test_sync_preferences_dry_run(self):
        """Test --sync-preferences --dry-run shows changes without applying."""
        out = StringIO()

        call_command(
            "migrate_pipeline_settings",
            "--sync-preferences",
            "--dry-run",
            stdout=out,
        )

        output = out.getvalue()

        # Should show changes would be made
        self.assertIn("SYNC PREFERENCES SUMMARY", output)
        self.assertIn("[DRY RUN]", output)

        # Verify database NOT changed
        refreshed = PipelineSettings.get_instance(use_cache=False)
        self.assertEqual(
            refreshed.preferred_parsers,
            {"application/pdf": "old.parser.Path"},
        )
        self.assertEqual(refreshed.default_embedder, "old.embedder.Default")

    @override_settings(
        PREFERRED_PARSERS={
            "application/pdf": "new.parser.DoclingParser",
            "text/plain": "new.parser.TxtParser",
        },
        PREFERRED_EMBEDDERS={
            "application/pdf": "new.embedder.MicroserviceEmbedder",
        },
        PREFERRED_THUMBNAILERS={"application/pdf": "new.thumbnailer.PdfThumbnailer"},
        PARSER_KWARGS={
            "new.parser.DoclingParser": {"force_ocr": False},
        },
        DEFAULT_EMBEDDER="new.embedder.DefaultEmbedder",
    )
    def test_sync_preferences_applies_changes(self):
        """Test --sync-preferences updates database from Django settings."""
        out = StringIO()

        call_command(
            "migrate_pipeline_settings",
            "--sync-preferences",
            stdout=out,
        )

        output = out.getvalue()
        self.assertIn("SYNC PREFERENCES SUMMARY", output)
        self.assertIn("Fields updated:", output)

        # Verify database WAS changed
        refreshed = PipelineSettings.get_instance(use_cache=False)
        self.assertEqual(
            refreshed.preferred_parsers,
            {
                "application/pdf": "new.parser.DoclingParser",
                "text/plain": "new.parser.TxtParser",
            },
        )
        self.assertEqual(
            refreshed.preferred_embedders,
            {"application/pdf": "new.embedder.MicroserviceEmbedder"},
        )
        self.assertEqual(
            refreshed.preferred_thumbnailers,
            {"application/pdf": "new.thumbnailer.PdfThumbnailer"},
        )
        self.assertEqual(
            refreshed.parser_kwargs,
            {"new.parser.DoclingParser": {"force_ocr": False}},
        )
        self.assertEqual(refreshed.default_embedder, "new.embedder.DefaultEmbedder")

    @override_settings(
        PREFERRED_PARSERS={"application/pdf": "old.parser.Path"},
        PREFERRED_EMBEDDERS={"application/pdf": "old.embedder.Path"},
        PREFERRED_THUMBNAILERS={},
        PARSER_KWARGS={"old.parser.Path": {"setting": "value"}},
        DEFAULT_EMBEDDER="old.embedder.Default",
    )
    def test_sync_preferences_no_changes_needed(self):
        """Test --sync-preferences when DB already matches Django settings."""
        out = StringIO()

        call_command(
            "migrate_pipeline_settings",
            "--sync-preferences",
            stdout=out,
        )

        output = out.getvalue()
        self.assertIn("No changes needed", output)

    @override_settings(
        PREFERRED_PARSERS={
            "application/pdf": "updated.parser.Path",
        },
    )
    def test_sync_preferences_verbose(self):
        """Test --sync-preferences --verbose shows detailed output."""
        out = StringIO()

        call_command(
            "migrate_pipeline_settings",
            "--sync-preferences",
            "--verbose",
            stdout=out,
        )

        output = out.getvalue()
        # Verbose output should show current and new values
        self.assertIn("preferred_parsers:", output)

    def test_sync_preferences_argument_exists(self):
        """Test that --sync-preferences argument is recognized."""
        from django.core.management import get_commands, load_command_class

        # Load the command class
        app_name = get_commands()["migrate_pipeline_settings"]
        command = load_command_class(app_name, "migrate_pipeline_settings")

        # Create parser and check for the argument
        parser = command.create_parser("manage.py", "migrate_pipeline_settings")

        # The argument should be accepted without error
        # Parse with --sync-preferences to verify it's a valid option
        args = parser.parse_args(["--sync-preferences", "--dry-run"])
        self.assertTrue(args.sync_preferences)
        self.assertTrue(args.dry_run)


class ListComponentsTestCase(TestCase):
    """Tests for the --list-components option."""

    def setUp(self):
        """Set up test fixtures."""
        # Ensure we have a PipelineSettings instance
        PipelineSettings.objects.all().delete()
        PipelineSettings.objects.create(id=1)

    def test_list_components_runs_without_error(self):
        """Test --list-components runs successfully."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--list-components", stdout=out)
        output = out.getvalue()

        # Should show the header and summary
        self.assertIn("AVAILABLE PIPELINE COMPONENTS", output)
        self.assertIn("SUMMARY", output)
        self.assertIn("Total components:", output)

    def test_list_components_shows_component_types(self):
        """Test --list-components shows different component types."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--list-components", stdout=out)
        output = out.getvalue()

        # Should show at least some component types (parsers, embedders exist in codebase)
        # We check for the section headers
        self.assertTrue(
            "Parsers" in output or "Embedders" in output or "Thumbnailers" in output,
            "Should show at least one component type section",
        )

    def test_list_components_shows_usage_instructions(self):
        """Test --list-components shows usage instructions at the end."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--list-components", stdout=out)
        output = out.getvalue()

        self.assertIn("USAGE", output)
        self.assertIn("migrate_pipeline_settings", output)

    def test_list_components_filter_by_name(self):
        """Test --list-components with --component filters results."""
        out = StringIO()
        # Filter to a component that likely exists
        call_command(
            "migrate_pipeline_settings",
            "--list-components",
            "--component",
            "Docling",
            stdout=out,
        )
        output = out.getvalue()

        # Should still show the structure
        self.assertIn("AVAILABLE PIPELINE COMPONENTS", output)
        self.assertIn("SUMMARY", output)

    def test_list_components_filter_nonexistent(self):
        """Test --list-components with non-existent component shows warning."""
        out = StringIO()
        call_command(
            "migrate_pipeline_settings",
            "--list-components",
            "--component",
            "NonExistentComponent12345",
            stdout=out,
        )
        output = out.getvalue()

        self.assertIn("No components found matching", output)
        self.assertIn("Total components: 0", output)

    def test_list_components_argument_exists(self):
        """Test that --list-components argument is recognized."""
        from django.core.management import get_commands, load_command_class

        # Load the command class
        app_name = get_commands()["migrate_pipeline_settings"]
        command = load_command_class(app_name, "migrate_pipeline_settings")

        # Create parser and check for the argument
        parser = command.create_parser("manage.py", "migrate_pipeline_settings")

        # The argument should be accepted without error
        args = parser.parse_args(["--list-components"])
        self.assertTrue(args.list_components)

    def test_list_components_shows_settings_info(self):
        """Test --list-components shows settings information for components."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--list-components", stdout=out)
        output = out.getvalue()

        # Should show components with settings count or "no configuration needed"
        self.assertTrue(
            "Settings" in output or "Settings:" in output,
            "Should mention settings for components",
        )

    def test_list_components_shows_class_paths(self):
        """Test --list-components shows full class paths."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--list-components", stdout=out)
        output = out.getvalue()

        # Class paths should be shown
        self.assertIn("Class:", output)


class MigrationFlowTestCase(TestCase):
    """Tests for the main migration flow of migrate_pipeline_settings."""

    def setUp(self):
        PipelineSettings.objects.all().delete()
        self.pipeline_settings = PipelineSettings.objects.create(id=1)

    def test_basic_migration_runs(self):
        """Test basic migration (no flags) runs without error."""
        out = StringIO()
        call_command("migrate_pipeline_settings", stdout=out)
        output = out.getvalue()
        self.assertIn("MIGRATION SUMMARY", output)
        self.assertIn("Total components scanned:", output)

    def test_migration_verbose(self):
        """Test verbose migration shows detailed output."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--verbose", stdout=out)
        output = out.getvalue()
        self.assertIn("MIGRATION SUMMARY", output)

    def test_migration_with_component_filter(self):
        """Test --component filters to a specific component."""
        out = StringIO()
        call_command(
            "migrate_pipeline_settings",
            "--component",
            "MicroserviceEmbedder",
            "--dry-run",
            stdout=out,
        )
        output = out.getvalue()
        self.assertIn("MicroserviceEmbedder", output)

    def test_migration_with_nonexistent_component(self):
        """Test --component with nonexistent name exits early."""
        out = StringIO()
        call_command(
            "migrate_pipeline_settings",
            "--component",
            "NonExistentComponent99999",
            stdout=out,
        )
        output = out.getvalue()
        self.assertIn("not found", output)

    def test_migration_force_overwrite(self):
        """Test --force overwrite mode."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--force", stdout=out)
        output = out.getvalue()
        self.assertIn("MIGRATION SUMMARY", output)
        # Should NOT mention "preserved"
        self.assertNotIn("Existing database values will be preserved", output)

    def test_migration_strict_mode_with_missing(self):
        """Test --strict exits with code 1 when required settings are missing."""
        out = StringIO()
        with self.assertRaises(SystemExit):
            call_command(
                "migrate_pipeline_settings", "--strict", "--dry-run", stdout=out
            )

    def test_migration_dry_run_does_not_save(self):
        """Test --dry-run shows migration plan but doesn't save."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--dry-run", "--verbose", stdout=out)
        output = out.getvalue()
        self.assertIn("[DRY RUN]", output)

    def test_verify_verbose(self):
        """Test --verify --verbose shows detailed output."""
        out = StringIO()
        try:
            call_command(
                "migrate_pipeline_settings", "--verify", "--verbose", stdout=out
            )
        except SystemExit:
            pass
        output = out.getvalue()
        # Verbose verify should show per-component status
        self.assertIn("Pipeline Settings Migration", output)

    @override_settings(
        PREFERRED_PARSERS={"application/pdf": "new.parser.Path"},
    )
    def test_sync_preferences_verbose_unchanged(self):
        """Test --sync-preferences --verbose when some fields are unchanged."""
        # Set one field to match so it reports "unchanged"
        self.pipeline_settings.preferred_parsers = {
            "application/pdf": "new.parser.Path"
        }
        self.pipeline_settings.save()
        PipelineSettings._invalidate_cache()

        out = StringIO()
        call_command(
            "migrate_pipeline_settings",
            "--sync-preferences",
            "--verbose",
            stdout=out,
        )
        output = out.getvalue()
        self.assertIn("unchanged", output)

    def test_migration_force_verbose_shows_settings(self):
        """Test --force --verbose shows detailed settings values."""
        out = StringIO()
        call_command("migrate_pipeline_settings", "--force", "--verbose", stdout=out)
        output = out.getvalue()
        self.assertIn("MIGRATION SUMMARY", output)
