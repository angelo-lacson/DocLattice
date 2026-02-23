"""
DRF authentication backend for CorpusAccessToken-based worker auth.

Workers authenticate via:
    Authorization: WorkerKey <token>

The backend validates the token, checks expiry and account status,
and returns the associated WorkerAccount's User.
"""

import logging

from django.utils import timezone
from rest_framework import authentication, exceptions

from opencontractserver.worker_uploads.models import CorpusAccessToken

logger = logging.getLogger(__name__)

WORKER_AUTH_PREFIX = "WorkerKey"


class WorkerTokenAuthentication(authentication.BaseAuthentication):
    """
    Authenticates requests from external document-processing workers.

    Returns (user, token) where:
    - user: the auto-created Django User linked to the WorkerAccount
    - token: the CorpusAccessToken instance (available as request.auth)
    """

    def authenticate(self, request):
        auth_header = authentication.get_authorization_header(request).decode("utf-8")
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) == 0 or parts[0] != WORKER_AUTH_PREFIX:
            return None

        if len(parts) == 1:
            raise exceptions.AuthenticationFailed(
                "Invalid WorkerKey header. No token provided."
            )
        if len(parts) > 2:
            raise exceptions.AuthenticationFailed(
                "Invalid WorkerKey header. Token must not contain spaces."
            )

        return self._authenticate_token(parts[1])

    def _authenticate_token(self, key: str):
        try:
            token = CorpusAccessToken.objects.select_related(
                "worker_account", "worker_account__user"
            ).get(key=key)
        except CorpusAccessToken.DoesNotExist:
            raise exceptions.AuthenticationFailed("Invalid worker token.")

        if not token.is_active:
            raise exceptions.AuthenticationFailed("Token has been revoked.")

        if not token.worker_account.is_active:
            raise exceptions.AuthenticationFailed("Worker account is inactive.")

        if token.expires_at and timezone.now() >= token.expires_at:
            raise exceptions.AuthenticationFailed("Token has expired.")

        return (token.worker_account.user, token)

    def authenticate_header(self, request):
        return WORKER_AUTH_PREFIX
