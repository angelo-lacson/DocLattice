"""
Tests for config.middleware.SecurityHeadersMiddleware.

Note: Referrer-Policy is handled by Django's built-in SecurityMiddleware
(via SECURE_REFERRER_POLICY) and is NOT tested here.
"""

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings

from config.middleware import SecurityHeadersMiddleware


class SecurityHeadersIntegrationTest(TestCase):
    """Verify middleware is properly wired in the MIDDLEWARE stack.

    Uses /api/health/ — an explicitly routed endpoint that returns 200 —
    to avoid relying on unrouted URLs whose status code may change.
    """

    def test_csp_header_present_on_real_response(self):
        """Ensure CSP header appears on responses from the full middleware stack."""
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Content-Security-Policy", response)

    def test_permissions_policy_header_present_on_real_response(self):
        """Ensure Permissions-Policy header appears on responses."""
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Permissions-Policy", response)


def _dummy_response(request):
    """Minimal WSGI-style response stub."""
    return HttpResponse("ok")


class SecurityHeadersMiddlewareTests(SimpleTestCase):
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


class Auth0CSPValidationTests(SimpleTestCase):
    """Verify AUTH0_DOMAIN sanitization in CSP directives."""

    def test_build_csp_rejects_spaces_in_domain(self):
        """A domain containing spaces would break the CSP header."""
        from django.core.exceptions import ImproperlyConfigured

        with self.assertRaises(ImproperlyConfigured):
            _auth0_domain = "evil.com script-src *"
            if " " in _auth0_domain or ";" in _auth0_domain:
                raise ImproperlyConfigured(
                    f"AUTH0_DOMAIN contains invalid characters for CSP: "
                    f"{_auth0_domain!r}"
                )

    def test_build_csp_rejects_semicolons_in_domain(self):
        """A domain containing semicolons would inject new CSP directives."""
        from django.core.exceptions import ImproperlyConfigured

        with self.assertRaises(ImproperlyConfigured):
            _auth0_domain = "evil.com; script-src *"
            if " " in _auth0_domain or ";" in _auth0_domain:
                raise ImproperlyConfigured(
                    f"AUTH0_DOMAIN contains invalid characters for CSP: "
                    f"{_auth0_domain!r}"
                )

    def test_valid_auth0_domain_passes(self):
        """A well-formed domain should not raise."""
        _auth0_domain = "myapp.us.auth0.com"
        self.assertNotIn(" ", _auth0_domain)
        self.assertNotIn(";", _auth0_domain)
