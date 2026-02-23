"""Data migration to set up the Beat periodic task for draining worker uploads."""

from django.db import migrations

TASK_NAME = "worker-uploads-drain-pending"
TASK_PATH = "opencontractserver.worker_uploads.tasks.process_pending_uploads"


def create_periodic_task(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    # Run every 60 seconds to catch uploads that arrive during worker downtime
    schedule, _ = IntervalSchedule.objects.get_or_create(
        every=60,
        period="seconds",
    )

    if not PeriodicTask.objects.filter(name=TASK_NAME).exists():
        PeriodicTask.objects.create(
            name=TASK_NAME,
            task=TASK_PATH,
            interval=schedule,
            enabled=True,
            description=(
                "Periodic drain of pending worker document uploads. "
                "Ensures uploads are processed even if the per-request "
                "nudge was missed during task-worker downtime."
            ),
            queue="worker_uploads",
        )


def remove_periodic_task(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("worker_uploads", "0001_initial"),
        ("django_celery_beat", "0018_improve_crontab_helptext"),
    ]

    operations = [
        migrations.RunPython(create_periodic_task, reverse_code=remove_periodic_task),
    ]
