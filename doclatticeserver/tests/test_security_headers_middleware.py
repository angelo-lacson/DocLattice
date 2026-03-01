"""
Tests for config.middleware.SecurityHeadersMiddleware.

Note: Referrer-Policy is handled by Django's built-in SecurityMiddleware
(via SECURE_REFERRER_POLICY) and is NOT tested here.
"""

from django.http import HttpResponse
from django.test import RequestFactory, TestCase, override_settings

from config.middleware import SecurityHeadersMiddleware


class SecurityHeadersIntegrationTest(TestCase):
    """Verify middleware is properly wired in the MIDDLEWARE stack."""

    def test_csp_header_present_on_real_response(self):
        """Ensure CSP header appears on responses from the full middleware stack."""
        response = self.client.get("/")
        self.assertIn("Content-Security-Policy", response)

    def test_permissions_policy_header_present_on_real_response(self):
        """Ensure Permissions-Policy header appears on responses."""
        response = self.client.get("/")
        self.assertIn("Permissions-Policy", response)


def _dummy_response(request):
    """Minimal WSGI-style response stub."""
    return HttpResponse("ok")


class SecurityHeadersMiddlewareTests(TestCase):
    """Verify CSP and Permissions-Policy headers."""

    def setUp(self):
        self.factory = RequestFactory()

    # ------------------------------------------------------------------
    # Content-Security-Policy
    # ------------------------------------------------------------------
    @override_settings(
        SECURE_CSP_DIRECTIVES={
            "default-src": ["'self'"],
            "script-src": ["'self'"],
        },
        SECURE_PERMISSIONS_POLICY=None,
    )
    def test_csp_header_built_from_directives(self):
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        csp = response["Content-Security-Policy"]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("script-src 'self'", csp)

    @override_settings(
        SECURE_CSP_DIRECTIVES=None,
        SECURE_PERMISSIONS_POLICY=None,
    )
    def test_csp_omitted_when_none(self):
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        self.assertNotIn("Content-Security-Policy", response)

    @override_settings(
        SECURE_CSP_DIRECTIVES={},
        SECURE_PERMISSIONS_POLICY=None,
    )
    def test_csp_omitted_when_empty_dict(self):
        """Empty dict should be treated as falsy — no CSP header emitted."""
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        self.assertNotIn("Content-Security-Policy", response)

    @override_settings(
        SECURE_CSP_DIRECTIVES={
            "connect-src": ["'self'", "wss:", "ws:"],
        },
        SECURE_PERMISSIONS_POLICY=None,
    )
    def test_csp_multiple_values_per_directive(self):
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        self.assertEqual(
            response["Content-Security-Policy"],
            "connect-src 'self' wss: ws:",
        )

    # ------------------------------------------------------------------
    # Permissions-Policy
    # ------------------------------------------------------------------
    @override_settings(
        SECURE_PERMISSIONS_POLICY={
            "camera": [],
            "microphone": [],
            "geolocation": ["self"],
        },
        SECURE_CSP_DIRECTIVES=None,
    )
    def test_permissions_policy_header(self):
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        pp = response["Permissions-Policy"]
        self.assertIn("camera=()", pp)
        self.assertIn("microphone=()", pp)
        self.assertIn("geolocation=(self)", pp)

    @override_settings(
        SECURE_PERMISSIONS_POLICY=None,
        SECURE_CSP_DIRECTIVES=None,
    )
    def test_permissions_policy_omitted_when_none(self):
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        self.assertNotIn("Permissions-Policy", response)

    @override_settings(
        SECURE_PERMISSIONS_POLICY={},
        SECURE_CSP_DIRECTIVES=None,
    )
    def test_permissions_policy_omitted_when_empty_dict(self):
        """Empty dict should be treated as falsy — no header emitted."""
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        self.assertNotIn("Permissions-Policy", response)

    # ------------------------------------------------------------------
    # All headers together (default settings)
    # ------------------------------------------------------------------
    @override_settings(
        SECURE_CSP_DIRECTIVES={
            "default-src": ["'self'"],
            "object-src": ["'none'"],
        },
        SECURE_PERMISSIONS_POLICY={
            "camera": [],
        },
    )
    def test_all_headers_present(self):
        mw = SecurityHeadersMiddleware(_dummy_response)
        response = mw(self.factory.get("/"))
        self.assertIn("Content-Security-Policy", response)
        self.assertIn("Permissions-Policy", response)
