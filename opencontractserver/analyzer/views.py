import json
import logging

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from opencontractserver.analyzer.models import Analysis
from opencontractserver.notifications.models import (
    Notification,
    NotificationTypeChoices,
)
from opencontractserver.notifications.signals import (
    broadcast_notification_via_websocket,
)
from opencontractserver.tasks.analyzer_tasks import import_analysis
from opencontractserver.types.dicts import OpenContractsGeneratedCorpusPythonType
from opencontractserver.types.enums import JobStatus
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict

logger = logging.getLogger(__name__)


def _create_analysis_notification(analysis: Analysis, success: bool) -> None:
    """
    Create a notification for analysis completion or failure.

    Issue #624: Real-time notifications for analysis completion.

    Args:
        analysis: The Analysis instance
        success: True if analysis completed successfully, False if failed
    """
    try:
        if analysis.creator:
            notification = Notification.objects.create(
                recipient=analysis.creator,
                notification_type=(
                    NotificationTypeChoices.ANALYSIS_COMPLETE
                    if success
                    else NotificationTypeChoices.ANALYSIS_FAILED
                ),
                data={
                    "analysis_id": analysis.id,
                    "analyzer_name": (
                        analysis.analyzer.analyzer_id if analysis.analyzer else None
                    ),
                    "corpus_name": (
                        analysis.analyzed_corpus.title
                        if analysis.analyzed_corpus
                        else None
                    ),
                    "status": "completed" if success else "failed",
                },
            )
            broadcast_notification_via_websocket(notification)
            logger.debug(
                f"Created {'ANALYSIS_COMPLETE' if success else 'ANALYSIS_FAILED'} "
                f"notification for {analysis.creator.username}"
            )
    except Exception as e:
        logger.warning(f"Failed to create analysis notification: {e}")


class AnalysisCallbackView(APIView):

    authentication_classes = []  # no auth
    permission_classes = []  # no permissioning

    def post(self, request, analysis_id):

        logger.info(f"Handle callback for analysis_id: {analysis_id}")

        try:
            analysis = Analysis.objects.get(id=analysis_id)

        except Analysis.DoesNotExist:
            return Response(
                {
                    "message": "Provided analysis id does not map to an analysis. Are you sure it's correct?",
                    "analysis_id": f"{analysis_id}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        callback_token = request.META.get("HTTP_CALLBACK_TOKEN")
        if callback_token is None:
            return Response(
                {
                    "message": "No CALLBACK_TOKEN provided in headers... Was this provided to the Gremlin Engine? "
                    "It's required to authenticate the callback to OpenContracts.",
                    "analysis_id": f"{analysis_id}",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        else:

            if analysis.callback_token.__str__() != callback_token:

                with transaction.atomic():
                    analysis.analysis_completed = timezone.now()
                    analysis.status = JobStatus.FAILED
                    analysis.save()

                # Send failure notification (Issue #624)
                _create_analysis_notification(analysis, success=False)

                return Response(
                    {
                        "message": f"CALLBACK_TOKEN provided but it does not match the token issued for analysis "
                        f"{analysis_id} . Did you provide the right token to the Gremlin Engine? "
                        f"Check your analysis_id too.",
                        "analysis_id": f"{analysis_id}",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            else:

                received_json = json.loads(request.body.decode("utf-8"))
                logger.info(f"Received json data from analysis {analysis_id}")

                if is_dict_instance_of_typed_dict(
                    received_json, OpenContractsGeneratedCorpusPythonType
                ):

                    with transaction.atomic():
                        analysis.received_callback_file.save(
                            f"analysis_{analysis.id}_results.json",
                            ContentFile(request.body),
                        )
                        analysis.analysis_completed = timezone.now()
                        analysis.status = JobStatus.COMPLETED
                        analysis.save()

                    # Send success notification (Issue #624)
                    _create_analysis_notification(analysis, success=True)

                    # logger.info("Launch async import task!")
                    import_analysis.si(
                        creator_id=analysis.creator.id,
                        analysis_id=analysis.id,
                        analysis_results=received_json,
                    ).apply_async()

                else:

                    with transaction.atomic():
                        analysis.analysis_completed = timezone.now()
                        analysis.status = JobStatus.FAILED
                        analysis.save()

                    # Send failure notification (Issue #624)
                    _create_analysis_notification(analysis, success=False)

                    return Response(
                        {
                            "message": "Received data is not of the proper format.",
                            "analysis_id": f"{analysis_id}",
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        return Response({"status": "OK", "analysis_id": analysis_id})
