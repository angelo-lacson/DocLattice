"""
Custom admin login views supporting Auth0 authentication.

These views provide a seamless login experience that supports both
Auth0 authentication (when USE_AUTH0=True) and traditional password
authentication (always available as fallback).
"""

import logging

from django.conf import settings
from django.contrib import admin, messages
from django.contrib.auth import authenticate, login, logout
from django.shortcuts import redirect, render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_protect

logger = logging.getLogger(__name__)


class Auth0AdminLoginView(View):
    """
    Custom admin login view that supports both Auth0 and password authentication.

    When USE_AUTH0 is enabled:
    - Displays Auth0 login button
    - Accepts JWT token for authentication
    - Falls back to password form if Auth0 fails

    When USE_AUTH0 is disabled:
    - Redirects to standard Django admin login
    """

    template_name = "admin/auth0_login.html"

    @method_decorator(csrf_protect)
    def get(self, request):
        """Display the appropriate login form."""
        # Check if user is already authenticated
        if request.user.is_authenticated and request.user.is_staff:
            return redirect(f"/{settings.ADMIN_URL}")

        # Check for token in query params (from Auth0 callback)
        token = request.GET.get("token")
        if token:
            return self._authenticate_with_token(request, token)

        context = {
            "title": "Log in",
            "site_header": admin.site.site_header or "Django administration",
            "site_title": admin.site.site_title or "Django site admin",
            "use_auth0": getattr(settings, "USE_AUTH0", False),
            "next": request.GET.get("next", f"/{settings.ADMIN_URL}"),
        }

        # Add Auth0 settings if enabled
        if getattr(settings, "USE_AUTH0", False):
            context.update(
                {
                    "auth0_domain": getattr(settings, "AUTH0_DOMAIN", ""),
                    "auth0_client_id": getattr(settings, "AUTH0_CLIENT_ID", ""),
                    "auth0_audience": getattr(settings, "AUTH0_API_AUDIENCE", ""),
                }
            )

        return render(request, self.template_name, context)

    @method_decorator(csrf_protect)
    def post(self, request):
        """Handle token-based login via POST or password authentication."""
        token = request.POST.get("token")
        if token:
            return self._authenticate_with_token(request, token)

        # Fall back to standard password authentication
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)

        if user is not None and user.is_staff:
            login(request, user)
            next_url = request.POST.get("next", f"/{settings.ADMIN_URL}")
            return redirect(next_url)

        messages.error(request, "Invalid credentials or insufficient permissions.")
        return redirect(request.path)

    def _authenticate_with_token(self, request, token):
        """Authenticate user with Auth0 JWT token."""
        from config.jwt_utils import get_user_from_jwt_token

        try:
            user = get_user_from_jwt_token(token)

            if user and user.is_active and user.is_staff:
                # Use the Auth0AdminBackend for session login
                login(
                    request,
                    user,
                    backend="config.admin_auth.backends.Auth0AdminBackend",
                )
                next_url = request.GET.get(
                    "next", request.POST.get("next", f"/{settings.ADMIN_URL}")
                )
                logger.info(f"Admin login successful for {user.username}")
                return redirect(next_url)
            else:
                logger.warning(
                    f"User {user.username if user else 'unknown'} denied admin access"
                )
                messages.error(
                    request, "You do not have permission to access the admin."
                )
                return redirect(request.path)

        except Exception as e:
            logger.error(f"Admin token authentication failed: {e}")
            messages.error(request, "Authentication failed. Please try again.")
            return redirect(request.path)


class Auth0AdminLogoutView(View):
    """Handle admin logout with Auth0 session cleanup."""

    def get(self, request):
        """Log out the user and redirect appropriately."""
        logout(request)

        if getattr(settings, "USE_AUTH0", False):
            # Redirect to Auth0 logout to clear Auth0 session
            return_to = request.build_absolute_uri("/")
            auth0_domain = getattr(settings, "AUTH0_DOMAIN", "")
            auth0_client_id = getattr(settings, "AUTH0_CLIENT_ID", "")
            logout_url = (
                f"https://{auth0_domain}/v2/logout"
                f"?client_id={auth0_client_id}"
                f"&returnTo={return_to}"
            )
            return redirect(logout_url)

        return redirect(f"/{settings.ADMIN_URL}")

    def post(self, request):
        """Handle POST logout requests (for CSRF-protected forms)."""
        return self.get(request)
