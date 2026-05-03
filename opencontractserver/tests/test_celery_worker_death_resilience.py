"""
Regression tests for Issue #1493: Celery resilience to worker death.

OpenContracts enables ``CELERY_TASK_ACKS_LATE`` and
``CELERY_TASK_REJECT_ON_WORKER_LOST`` so that a worker dying mid-task
(OOM, SIGKILL, host loss, deploy eviction) results in the broker redelivering
the message to another worker instead of silently dropping it.

Real-broker simulation of a SIGKILL'd worker would require a multi-process
test harness with rabbit/redis, which is out of scope for the unit-test
suite. Instead these tests pin the configuration that Celery itself uses to
make the redelivery decision, so a future settings change cannot silently
revert the resilience guarantee.
"""

from django.conf import settings
from django.test import SimpleTestCase

from config import celery_app


class CeleryWorkerDeathResilienceSettingsTests(SimpleTestCase):
    """Lock down the two settings and their propagation into the Celery app."""

    def test_django_settings_enable_acks_late(self) -> None:
        self.assertTrue(
            getattr(settings, "CELERY_TASK_ACKS_LATE", False),
            "CELERY_TASK_ACKS_LATE must be True so the broker only acks "
            "after a task returns successfully (Issue #1493).",
        )

    def test_django_settings_enable_reject_on_worker_lost(self) -> None:
        self.assertTrue(
            getattr(settings, "CELERY_TASK_REJECT_ON_WORKER_LOST", False),
            "CELERY_TASK_REJECT_ON_WORKER_LOST must be True so SIGKILL'd "
            "workers cause redelivery instead of silent task loss "
            "(Issue #1493).",
        )

    def test_celery_app_picks_up_acks_late(self) -> None:
        self.assertTrue(
            celery_app.app.conf.task_acks_late,
            "Celery app config did not pick up task_acks_late from Django "
            "settings — the namespace='CELERY' wiring may be broken.",
        )

    def test_celery_app_picks_up_reject_on_worker_lost(self) -> None:
        self.assertTrue(
            celery_app.app.conf.task_reject_on_worker_lost,
            "Celery app config did not pick up task_reject_on_worker_lost "
            "from Django settings — the namespace='CELERY' wiring may be "
            "broken.",
        )
