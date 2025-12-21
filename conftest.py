"""
Root pytest configuration for OpenContracts.

This file provides pytest-xdist parallel testing support and ensures proper
worker isolation for tests.
"""

import asyncio
import os

import pytest


def pytest_configure(config):
    """Configure pytest settings, including xdist worker handling."""
    # Ensure the serial marker is registered only once
    if not hasattr(config, "_serial_marker_registered"):
        config.addinivalue_line(
            "markers",
            "serial: mark test to run serially (not in parallel with other tests)",
        )
        config._serial_marker_registered = True


def pytest_collection_modifyitems(config, items):
    """Modify test collection to handle serial tests when running with xdist."""
    # Check if running with xdist by looking at numprocesses option
    # Note: workerinput is only on workers, but collection happens on controller
    numprocesses = getattr(config.option, "numprocesses", None)
    if not numprocesses:
        return

    # When running with xdist, mark serial tests to run on worker gw0 only
    # This ensures they run sequentially without interference from other workers
    for item in items:
        if item.get_closest_marker("serial"):
            # Add xdist_group to ensure all serial tests run on same worker
            item.add_marker(pytest.mark.xdist_group(name="serial"))


def pytest_xdist_setup(scheduler):
    """
    Configure xdist scheduler to ensure serial tests are scheduled together.

    This hook runs on the controller after scheduler is created.
    """
    pass  # xdist_group marker should handle grouping


@pytest.fixture(scope="session")
def django_db_modify_db_settings(django_db_modify_db_settings_parallel_suffix):
    """
    Fixture to ensure each xdist worker gets its own database.

    This is automatically handled by pytest-django when running with xdist,
    but we explicitly include it here for clarity.
    """
    pass


def pytest_xdist_setupnodes(config, specs):
    """Called before any workers are created. Use for one-time setup."""
    pass


def pytest_xdist_make_scheduler(config, log):
    """
    Create a scheduler that respects test grouping.

    Using LoadScopeScheduling keeps tests from the same class together,
    which is important for setUpClass/setUpTestData patterns.
    """
    # Return None to use the default scheduler specified by --dist option
    # Users should specify --dist loadscope for proper class-level grouping
    return None


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_setup(item):
    """Setup hook that runs before each test."""
    # Get worker ID for logging (empty string if not using xdist)
    worker_id = os.environ.get("PYTEST_XDIST_WORKER", "")
    if worker_id:
        # Set worker ID in environment for tests that need to know
        os.environ["TEST_WORKER_ID"] = worker_id

    # Ensure a fresh event loop is available for each test.
    # This prevents "Event loop is closed" errors when using pydantic-ai's
    # run_sync() or other async code with pytest-xdist.
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("Event loop is closed")
    except RuntimeError:
        # Create a new event loop if one doesn't exist or is closed
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)


@pytest.hookimpl(trylast=True)
def pytest_runtest_teardown(item, nextitem):
    """Teardown hook that runs after each test."""
    # Clean up any event loop that was created during the test
    # to prevent resource leaks, but don't close it as the next test may need it
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If the loop is still running, we can't close it safely
            pass
        elif not loop.is_closed():
            # Cancel any pending tasks
            pending = asyncio.all_tasks(loop) if hasattr(asyncio, "all_tasks") else []
            for task in pending:
                task.cancel()
    except RuntimeError:
        # No event loop, nothing to clean up
        pass
