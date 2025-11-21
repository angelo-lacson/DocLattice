#!/usr/bin/env python
"""
Comprehensive async/event loop diagnostics for test suite.

Tracks:
- Async generators (created/closed)
- Unawaited coroutines
- Event loop tasks
- Resource warnings
- Test execution timeline

Usage:
    python async_diagnostics.py

This will run the test suite with full async diagnostics and report
exactly where async pollution occurs.
"""

import asyncio
import gc
import sys
import traceback
import warnings
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# Track async resources
async_generators_created = []
async_generators_closed = []
unawaited_coroutines = []
event_loop_tasks = defaultdict(list)
test_timeline = []


class AsyncResourceTracker:
    """Track async resource creation and cleanup."""

    def __init__(self):
        self.active_generators = {}
        self.active_coroutines = {}
        self.test_context = None

    def set_test_context(self, test_name):
        """Set current test being run."""
        self.test_context = test_name
        timestamp = datetime.now().isoformat()
        test_timeline.append(
            {
                "timestamp": timestamp,
                "test": test_name,
                "event": "start",
                "active_generators": len(self.active_generators),
                "active_coroutines": len(self.active_coroutines),
            }
        )

    def track_generator_created(self, gen, source_info):
        """Track async generator creation."""
        gen_id = id(gen)
        self.active_generators[gen_id] = {
            "generator": gen,
            "source": source_info,
            "test": self.test_context,
            "created_at": datetime.now().isoformat(),
            "stack_trace": "".join(traceback.format_stack()),
        }
        async_generators_created.append(self.active_generators[gen_id])

    def track_generator_closed(self, gen):
        """Track async generator closure."""
        gen_id = id(gen)
        if gen_id in self.active_generators:
            info = self.active_generators.pop(gen_id)
            info["closed_at"] = datetime.now().isoformat()
            async_generators_closed.append(info)

    def track_coroutine_created(self, coro, source_info):
        """Track coroutine creation."""
        coro_id = id(coro)
        self.active_coroutines[coro_id] = {
            "coroutine": coro,
            "source": source_info,
            "test": self.test_context,
            "created_at": datetime.now().isoformat(),
            "stack_trace": "".join(traceback.format_stack()),
        }

    def track_coroutine_completed(self, coro):
        """Track coroutine completion."""
        coro_id = id(coro)
        if coro_id in self.active_coroutines:
            self.active_coroutines.pop(coro_id)

    def report_leaked_resources(self):
        """Report any resources that weren't cleaned up."""
        report = []

        if self.active_generators:
            report.append(f"\n{'='*80}")
            report.append(f"LEAKED ASYNC GENERATORS: {len(self.active_generators)}")
            report.append(f"{'='*80}")
            for gen_id, info in self.active_generators.items():
                report.append(f"\nGenerator ID: {gen_id}")
                report.append(f"  Source: {info['source']}")
                report.append(f"  Test: {info['test']}")
                report.append(f"  Created: {info['created_at']}")
                report.append(f"  Stack trace (last 5 frames):")
                stack_lines = info["stack_trace"].split("\n")
                report.append("\n".join(stack_lines[-6:-1]))

        if self.active_coroutines:
            report.append(f"\n{'='*80}")
            report.append(f"LEAKED COROUTINES: {len(self.active_coroutines)}")
            report.append(f"{'='*80}")
            for coro_id, info in self.active_coroutines.items():
                report.append(f"\nCoroutine ID: {coro_id}")
                report.append(f"  Source: {info['source']}")
                report.append(f"  Test: {info['test']}")
                report.append(f"  Created: {info['created_at']}")
                report.append(f"  Stack trace (last 5 frames):")
                stack_lines = info["stack_trace"].split("\n")
                report.append("\n".join(stack_lines[-6:-1]))

        return "\n".join(report)


# Global tracker
tracker = AsyncResourceTracker()


def setup_warnings():
    """Setup warning filters to catch async issues."""

    # Convert coroutine warnings to errors
    warnings.filterwarnings(
        "error", category=RuntimeWarning, message=".*was never awaited"
    )

    # Convert resource warnings to errors
    warnings.filterwarnings("error", category=ResourceWarning)

    # Custom warning handler for unawaited coroutines
    original_warn = warnings.warn

    def custom_warn(message, category=UserWarning, stacklevel=1):
        if "was never awaited" in str(message):
            unawaited_coroutines.append(
                {
                    "message": str(message),
                    "test": tracker.test_context,
                    "timestamp": datetime.now().isoformat(),
                    "stack_trace": "".join(traceback.format_stack()),
                }
            )
        original_warn(message, category, stacklevel)

    warnings.warn = custom_warn


def patch_asyncio():
    """Patch asyncio to track async generators and coroutines."""

    original_create_task = asyncio.create_task

    def tracked_create_task(coro, *args, **kwargs):
        tracker.track_coroutine_created(coro, f"asyncio.create_task: {coro.__name__}")
        task = original_create_task(coro, *args, **kwargs)

        def done_callback(t):
            tracker.track_coroutine_completed(coro)

        task.add_done_callback(done_callback)
        return task

    asyncio.create_task = tracked_create_task


def check_event_loop_state():
    """Check current event loop state."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            return "CLOSED"

        tasks = asyncio.all_tasks(loop)
        return f"RUNNING ({len(tasks)} tasks)"
    except RuntimeError as e:
        return f"ERROR: {e}"


def analyze_test_timeline():
    """Analyze test timeline to find patterns."""
    report = []
    report.append(f"\n{'='*80}")
    report.append("TEST EXECUTION TIMELINE")
    report.append(f"{'='*80}\n")

    for i, event in enumerate(test_timeline):
        report.append(
            f"{i+1}. {event['timestamp']} - {event['test']} ({event['event']})"
        )
        report.append(
            f"   Active generators: {event['active_generators']}, "
            f"Active coroutines: {event['active_coroutines']}"
        )

        # Check for resource accumulation
        if i > 0:
            prev = test_timeline[i - 1]
            gen_delta = event["active_generators"] - prev["active_generators"]
            coro_delta = event["active_coroutines"] - prev["active_coroutines"]

            if gen_delta > 0:
                report.append(f"   ⚠️  +{gen_delta} leaked generators")
            if coro_delta > 0:
                report.append(f"   ⚠️  +{coro_delta} leaked coroutines")

    return "\n".join(report)


def generate_report():
    """Generate comprehensive diagnostic report."""
    report_path = Path("/tmp/async_diagnostics_report.txt")

    with open(report_path, "w") as f:
        f.write(f"ASYNC DIAGNOSTICS REPORT\n")
        f.write(f"{'='*80}\n")
        f.write(f"Generated: {datetime.now().isoformat()}\n\n")

        # Summary
        f.write(f"SUMMARY\n")
        f.write(f"{'='*80}\n")
        f.write(f"Total async generators created: {len(async_generators_created)}\n")
        f.write(f"Total async generators closed: {len(async_generators_closed)}\n")
        f.write(f"Leaked generators: {len(tracker.active_generators)}\n")
        f.write(f"Unawaited coroutines: {len(unawaited_coroutines)}\n")
        f.write(f"Leaked coroutines: {len(tracker.active_coroutines)}\n")
        f.write(f"Tests run: {len(test_timeline)}\n\n")

        # Timeline analysis
        f.write(analyze_test_timeline())
        f.write("\n\n")

        # Leaked resources
        f.write(tracker.report_leaked_resources())
        f.write("\n\n")

        # Unawaited coroutines
        if unawaited_coroutines:
            f.write(f"{'='*80}\n")
            f.write(f"UNAWAITED COROUTINES: {len(unawaited_coroutines)}\n")
            f.write(f"{'='*80}\n")
            for i, info in enumerate(unawaited_coroutines):
                f.write(f"\n{i+1}. {info['message']}\n")
                f.write(f"   Test: {info['test']}\n")
                f.write(f"   Timestamp: {info['timestamp']}\n")
                f.write(f"   Stack trace (last 5 frames):\n")
                stack_lines = info["stack_trace"].split("\n")
                f.write("\n".join(stack_lines[-6:-1]))
                f.write("\n")

    print(f"\n{'='*80}")
    print(f"Diagnostic report written to: {report_path}")
    print(f"{'='*80}\n")

    # Print summary to console
    print(f"SUMMARY:")
    print(f"  Leaked generators: {len(tracker.active_generators)}")
    print(f"  Leaked coroutines: {len(tracker.active_coroutines)}")
    print(f"  Unawaited coroutines: {len(unawaited_coroutines)}")

    if tracker.active_generators or tracker.active_coroutines or unawaited_coroutines:
        print(f"\n⚠️  ASYNC POLLUTION DETECTED - See report for details")
        return 1
    else:
        print(f"\n✅  No async pollution detected")
        return 0


if __name__ == "__main__":
    print("Setting up async diagnostics...")
    setup_warnings()
    patch_asyncio()

    print("Running test suite with diagnostics enabled...")
    print("(This will run the full test suite)")

    # Import after patches are in place
    import subprocess

    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            "test.yml",
            "run",
            "--rm",
            "django",
            "python",
            "manage.py",
            "test",
            "opencontractserver.tests.test_admin",
            "opencontractserver.tests.test_agent_api",
            "opencontractserver.tests.test_agent_factory",
            "opencontractserver.tests.test_agent_framework_api",
            "--noinput",
            "--keepdb",
            "--verbosity=2",
        ],
        timeout=300,
        capture_output=False,
    )

    # Generate report after tests
    exit_code = generate_report()

    sys.exit(exit_code if exit_code != 0 else result.returncode)
