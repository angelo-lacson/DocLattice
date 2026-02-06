"""
Authentication backend for Django admin with Auth0 support.

This backend allows Auth0-authenticated users to access Django admin
when USE_AUTH0 is enabled, falling back to standard authentication
when disabled.
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

logger = logging.getLogger(__name__)
User = get_user_model()


class Auth0AdminBackend(ModelBackend):
    """
    Admin authentication backend that works with Auth0.

    This backend is used by the custom admin login view to authenticate
    users who have already authenticated via Auth0 on the frontend.

    For users who navigate directly to /admin/, it redirects them to
    the frontend Auth0 login flow, then back to admin.
    """

    def authenticate(self, request, auth0_user_id=None, **kwargs):
        """
        Authenticate a user by their Auth0 user ID (sub claim).

        This is called after the user has authenticated via Auth0 on the
        frontend and the token has been validated.

        Args:
            request: The HTTP request object.
            auth0_user_id: The Auth0 user ID (sub claim from JWT).
            **kwargs: Additional keyword arguments (ignored).

        Returns:
            User: The authenticated user if valid and is_staff, None otherwise.
        """
        if not getattr(settings, "USE_AUTH0", False):
            return None

        if not auth0_user_id:
            return None

        try:
            user = User.objects.get(username=auth0_user_id)
            if user.is_active and user.is_staff:
                logger.info(
                    f"Auth0 admin authentication successful for {user.username}"
                )
                return user
            else:
                logger.warning(
                    f"Auth0 user {auth0_user_id} denied admin access: "
                    f"is_active={user.is_active}, is_staff={user.is_staff}"
                )
                return None
        except User.DoesNotExist:
            logger.warning(f"Auth0 admin auth failed: user {auth0_user_id} not found")
            return None

    def get_user(self, user_id):
        """Retrieve user by primary key."""
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None
