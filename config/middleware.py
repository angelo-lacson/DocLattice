"""
Custom security middleware for OpenContracts.

Adds Content-Security-Policy and Permissions-Policy headers to all responses.
Configuration is driven by Django settings (see base.py).

Note: Referrer-Policy is handled by Django's built-in SecurityMiddleware via
the SECURE_REFERRER_POLICY setting and is NOT duplicated here.
"""

from django.conf import settings


class SecurityHeadersMiddleware:
    """
    Middleware that adds security headers to HTTP responses.

    Configured via Django settings:
        SECURE_CSP_DIRECTIVES      – dict of CSP directive name → list of values
        SECURE_PERMISSIONS_POLICY  – dict of feature name → list of allowlist tokens

    Note: Referrer-Policy is handled by Django's built-in SecurityMiddleware
    (django.middleware.security.SecurityMiddleware) via SECURE_REFERRER_POLICY.
    """

    def __init__(self, get_response):
        self.get_response = get_response

        # Pre-build header values once at startup for performance.
        self._csp = self._build_csp(getattr(settings, "SECURE_CSP_DIRECTIVES", None))
        self._permissions = self._build_permissions_policy(
            getattr(settings, "SECURE_PERMISSIONS_POLICY", None)
        )

    def __call__(self, request):
        response = self.get_response(request)

        if self._csp:
            response["Content-Security-Policy"] = self._csp

        if self._permissions:
            response["Permissions-Policy"] = self._permissions

        return response

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_csp(directives):
        """
        Build a CSP header string from a directive dict.

        Example input::

            {
                "default-src": ["'self'"],
                "script-src":  ["'self'"],
                "connect-src": ["'self'", "wss:"],
            }

        Returns ``"default-src 'self'; script-src 'self'; connect-src 'self' wss:"``
        or ``None`` if *directives* is falsy.
        """
        if not directives:
            return None
        parts = []
        for directive, values in directives.items():
            parts.append(f"{directive} {' '.join(values)}")
        return "; ".join(parts)

    @staticmethod
    def _build_permissions_policy(features):
        """
        Build a Permissions-Policy header string from a feature dict.

        Example input::

            {
                "camera":     [],
                "microphone": [],
                "geolocation": ["self"],
            }

        Returns ``"camera=(), microphone=(), geolocation=(self)"``
        or ``None`` if *features* is falsy.
        """
        if not features:
            return None
        parts = []
        for feature, allowlist in features.items():
            if allowlist:
                inner = " ".join(allowlist)
                parts.append(f"{feature}=({inner})")
            else:
                parts.append(f"{feature}=()")
        return ", ".join(parts)
