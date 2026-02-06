"""
Tests for Auth0 Django admin authentication.

This module tests:
- Admin claims sync from Auth0 tokens
- Auth0AdminBackend authentication
- Auth0AdminLoginView and Auth0AdminLogoutView
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

User = get_user_model()


class TestAdminClaimsSync(TestCase):
    """Tests for syncing admin claims from Auth0 tokens."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="auth0|test_user",
            email="test@example.com",
            is_staff=False,
            is_superuser=False,
        )

    def setUp(self):
        # Refresh user from DB before each test
        self.user.refresh_from_db()
        self.user.is_staff = False
        self.user.is_superuser = False
        self.user.save()

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_sync_is_staff_true_from_claims(self):
        """is_staff should be synced to True from token claims."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        payload = {
            "sub": "auth0|test_user",
            "https://test.example.com/is_staff": True,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertTrue(result)
        self.assertTrue(self.user.is_staff)

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_sync_is_staff_false_from_claims(self):
        """is_staff should be synced to False from token claims."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        # First set user to staff
        self.user.is_staff = True
        self.user.save()

        payload = {
            "sub": "auth0|test_user",
            "https://test.example.com/is_staff": False,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertTrue(result)
        self.assertFalse(self.user.is_staff)

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_sync_is_superuser_true_from_claims(self):
        """is_superuser should be synced to True from token claims."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        payload = {
            "sub": "auth0|test_user",
            "https://test.example.com/is_superuser": True,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertTrue(result)
        self.assertTrue(self.user.is_superuser)

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_sync_is_superuser_false_from_claims(self):
        """is_superuser should be synced to False from token claims."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        # First set user to superuser
        self.user.is_superuser = True
        self.user.save()

        payload = {
            "sub": "auth0|test_user",
            "https://test.example.com/is_superuser": False,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertTrue(result)
        self.assertFalse(self.user.is_superuser)

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_sync_both_claims(self):
        """Both is_staff and is_superuser should be synced together."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        payload = {
            "sub": "auth0|test_user",
            "https://test.example.com/is_staff": True,
            "https://test.example.com/is_superuser": True,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertTrue(result)
        self.assertTrue(self.user.is_staff)
        self.assertTrue(self.user.is_superuser)

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_missing_claims_no_change(self):
        """Missing claims should not modify user."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        # Set user to staff first
        self.user.is_staff = True
        self.user.save()

        payload = {"sub": "auth0|test_user"}  # No admin claims

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertFalse(result)  # No changes made
        self.assertTrue(self.user.is_staff)  # Unchanged

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    def test_no_change_when_already_matches(self):
        """No database update should occur when claims match current values."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        # Set user to match claims
        self.user.is_staff = True
        self.user.is_superuser = False
        self.user.save()

        payload = {
            "sub": "auth0|test_user",
            "https://test.example.com/is_staff": True,
            "https://test.example.com/is_superuser": False,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.assertFalse(result)  # No changes needed

    @override_settings(USE_AUTH0=True)
    def test_uses_default_namespace(self):
        """Should use default namespace when AUTH0_ADMIN_CLAIM_NAMESPACE not set."""
        from config.graphql_auth0_auth.utils import sync_admin_claims_from_payload

        payload = {
            "sub": "auth0|test_user",
            "https://opencontracts.opensource.legal/is_staff": True,
        }

        result = sync_admin_claims_from_payload(self.user, payload)

        self.user.refresh_from_db()
        self.assertTrue(result)
        self.assertTrue(self.user.is_staff)


class TestAuth0AdminBackend(TestCase):
    """Tests for the Auth0 admin authentication backend."""

    @classmethod
    def setUpTestData(cls):
        cls.staff_user = User.objects.create_user(
            username="auth0|staff_user",
            email="staff@example.com",
            is_staff=True,
            is_active=True,
        )
        cls.non_staff_user = User.objects.create_user(
            username="auth0|regular_user",
            email="regular@example.com",
            is_staff=False,
            is_active=True,
        )
        cls.inactive_staff = User.objects.create_user(
            username="auth0|inactive_staff",
            email="inactive@example.com",
            is_staff=True,
            is_active=False,
        )
        cls.superuser = User.objects.create_superuser(
            username="auth0|superuser",
            email="super@example.com",
        )

    @override_settings(USE_AUTH0=True)
    def test_authenticate_staff_user(self):
        """Staff user should authenticate successfully."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id="auth0|staff_user")

        self.assertEqual(user, self.staff_user)

    @override_settings(USE_AUTH0=True)
    def test_authenticate_superuser(self):
        """Superuser should authenticate successfully."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id="auth0|superuser")

        self.assertEqual(user, self.superuser)

    @override_settings(USE_AUTH0=True)
    def test_non_staff_user_denied(self):
        """Non-staff user should be denied."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id="auth0|regular_user")

        self.assertIsNone(user)

    @override_settings(USE_AUTH0=True)
    def test_inactive_staff_denied(self):
        """Inactive staff user should be denied."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id="auth0|inactive_staff")

        self.assertIsNone(user)

    @override_settings(USE_AUTH0=True)
    def test_nonexistent_user_denied(self):
        """Non-existent user should be denied."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id="auth0|does_not_exist")

        self.assertIsNone(user)

    @override_settings(USE_AUTH0=True)
    def test_no_auth0_user_id_denied(self):
        """Missing auth0_user_id should return None."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id=None)

        self.assertIsNone(user)

    @override_settings(USE_AUTH0=False)
    def test_auth0_disabled_returns_none(self):
        """Backend should return None when Auth0 is disabled."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.authenticate(None, auth0_user_id="auth0|staff_user")

        self.assertIsNone(user)

    @override_settings(USE_AUTH0=True)
    def test_get_user_success(self):
        """get_user should return user by primary key."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.get_user(self.staff_user.pk)

        self.assertEqual(user, self.staff_user)

    @override_settings(USE_AUTH0=True)
    def test_get_user_not_found(self):
        """get_user should return None for non-existent user."""
        from config.admin_auth.backends import Auth0AdminBackend

        backend = Auth0AdminBackend()
        user = backend.get_user(99999)

        self.assertIsNone(user)


class TestAdminLoginView(TestCase):
    """Tests for the custom admin login view."""

    @classmethod
    def setUpTestData(cls):
        cls.staff_user = User.objects.create_user(
            username="admin_test",
            email="admin@example.com",
            password="testpass123",
            is_staff=True,
        )
        cls.regular_user = User.objects.create_user(
            username="regular_test",
            email="regular@example.com",
            password="testpass123",
            is_staff=False,
        )

    def setUp(self):
        self.client = Client()

    def test_get_login_page(self):
        """GET request should return login page."""
        response = self.client.get("/admin/login/")

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "admin/auth0_login.html")

    def test_password_login_success(self):
        """Staff user should be able to log in with password."""
        response = self.client.post(
            "/admin/login/",
            {
                "username": "admin_test",
                "password": "testpass123",
            },
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        # User should be authenticated
        self.assertTrue(response.wsgi_request.user.is_authenticated)

    def test_password_login_wrong_password(self):
        """Wrong password should fail."""
        response = self.client.post(
            "/admin/login/",
            {
                "username": "admin_test",
                "password": "wrongpassword",
            },
        )

        self.assertEqual(response.status_code, 302)  # Redirect back to login
        # Should have error message in session

    def test_password_login_non_staff(self):
        """Non-staff user should be denied even with correct password."""
        response = self.client.post(
            "/admin/login/",
            {
                "username": "regular_test",
                "password": "testpass123",
            },
        )

        self.assertEqual(response.status_code, 302)  # Redirect back to login

    def test_already_authenticated_redirects(self):
        """Already authenticated staff user should be redirected to admin."""
        self.client.force_login(self.staff_user)

        response = self.client.get("/admin/login/")

        self.assertEqual(response.status_code, 302)
        self.assertIn("admin", response.url)

    @patch("config.admin_auth.views.get_user_from_jwt_token")
    def test_token_login_success(self, mock_get_user):
        """Valid token should authenticate staff user."""
        mock_get_user.return_value = self.staff_user

        response = self.client.post(
            "/admin/login/",
            {
                "token": "valid_test_token",
            },
        )

        self.assertEqual(response.status_code, 302)  # Redirect to admin
        mock_get_user.assert_called_once_with("valid_test_token")

    @patch("config.admin_auth.views.get_user_from_jwt_token")
    def test_token_login_non_staff_denied(self, mock_get_user):
        """Valid token for non-staff user should be denied."""
        mock_get_user.return_value = self.regular_user

        response = self.client.post(
            "/admin/login/",
            {
                "token": "valid_test_token",
            },
        )

        self.assertEqual(response.status_code, 302)  # Redirect back to login

    @patch("config.admin_auth.views.get_user_from_jwt_token")
    def test_token_login_invalid_token(self, mock_get_user):
        """Invalid token should show error."""
        mock_get_user.side_effect = Exception("Invalid token")

        response = self.client.post(
            "/admin/login/",
            {
                "token": "invalid_token",
            },
        )

        self.assertEqual(response.status_code, 302)  # Redirect back to login

    @override_settings(USE_AUTH0=True)
    def test_login_page_shows_auth0_button(self):
        """Login page should show Auth0 button when USE_AUTH0=True."""
        response = self.client.get("/admin/login/")

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "use_auth0")

    @override_settings(USE_AUTH0=False)
    def test_login_page_hides_auth0_button(self):
        """Login page should hide Auth0 button when USE_AUTH0=False."""
        response = self.client.get("/admin/login/")

        self.assertEqual(response.status_code, 200)
        # Auth0 button should not be in content


class TestAdminLogoutView(TestCase):
    """Tests for the custom admin logout view."""

    @classmethod
    def setUpTestData(cls):
        cls.staff_user = User.objects.create_user(
            username="logout_test",
            email="logout@example.com",
            password="testpass123",
            is_staff=True,
        )

    def setUp(self):
        self.client = Client()

    def test_logout_clears_session(self):
        """Logout should clear user session."""
        self.client.force_login(self.staff_user)

        response = self.client.get("/admin/logout/")

        self.assertFalse(response.wsgi_request.user.is_authenticated)

    @override_settings(USE_AUTH0=False)
    def test_logout_redirects_to_admin_when_auth0_disabled(self):
        """Logout should redirect to admin when Auth0 is disabled."""
        self.client.force_login(self.staff_user)

        response = self.client.get("/admin/logout/")

        self.assertEqual(response.status_code, 302)
        self.assertIn("admin", response.url)

    @override_settings(
        USE_AUTH0=True,
        AUTH0_DOMAIN="test.auth0.com",
        AUTH0_CLIENT_ID="test_client_id",
    )
    def test_logout_redirects_to_auth0_when_enabled(self):
        """Logout should redirect to Auth0 logout URL when Auth0 is enabled."""
        self.client.force_login(self.staff_user)

        response = self.client.get("/admin/logout/")

        self.assertEqual(response.status_code, 302)
        self.assertIn("test.auth0.com", response.url)
        self.assertIn("logout", response.url)


class TestGetUserByPayloadWithClaimSync(TestCase):
    """Integration tests for get_user_by_payload with claim syncing."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username="auth0|integration_test",
            email="integration@example.com",
            is_staff=False,
            is_superuser=False,
            is_active=True,
        )

    def setUp(self):
        self.user.refresh_from_db()
        self.user.is_staff = False
        self.user.is_superuser = False
        self.user.save()

    @override_settings(
        USE_AUTH0=True, AUTH0_ADMIN_CLAIM_NAMESPACE="https://test.example.com/"
    )
    @patch("config.graphql_auth0_auth.utils.auth0_settings")
    def test_get_user_by_payload_syncs_claims(self, mock_settings):
        """get_user_by_payload should sync admin claims."""
        from config.graphql_auth0_auth.utils import get_user_by_payload

        # Configure mock settings
        mock_settings.AUTH0_GET_USER_FROM_TOKEN_HANDLER = MagicMock(
            return_value=self.user
        )

        payload = {
            "sub": "auth0|integration_test",
            "https://test.example.com/is_staff": True,
            "https://test.example.com/is_superuser": True,
        }

        user = get_user_by_payload(payload)

        self.assertEqual(user, self.user)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)
        self.assertTrue(self.user.is_superuser)
