from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient


class UserModelTests(TestCase):
    def test_email_login_ignores_letter_case(self):
        user_model = get_user_model()
        created_user = user_model.objects.create_user(
            email="User@example.com",
            password="safe-test-password-123",
        )

        found_user = user_model.objects.get_by_natural_key("user@EXAMPLE.com")

        self.assertEqual(found_user, created_user)
        self.assertEqual(found_user.email, "User@example.com")

    def test_email_case_only_duplicate_is_rejected(self):
        user_model = get_user_model()
        user_model.objects.create_user(
            email="User@example.com",
            password="safe-test-password-123",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                user_model.objects.create_user(
                    email="user@example.com",
                    password="another-safe-password-456",
                )


class AuthenticationApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)

    def tearDown(self):
        cache.clear()

    def csrf_token(self):
        response = self.client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrftoken", response.cookies)
        return response.json()["csrf_token"]

    def post_with_csrf(self, path, data):
        return self.client.post(
            path,
            data,
            format="json",
            HTTP_X_CSRFTOKEN=self.csrf_token(),
        )

    def test_register_creates_user_and_starts_session(self):
        response = self.post_with_csrf(
            "/api/auth/register/",
            {
                "email": "User@example.com",
                "password": "safe-test-password-123",
                "password_confirmation": "safe-test-password-123",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()["user"]["email"], "User@example.com")
        self.assertTrue(
            get_user_model().objects.filter(email="User@example.com").exists()
        )

        session_response = self.client.get("/api/auth/me/")
        self.assertTrue(session_response.json()["is_authenticated"])

    def test_register_requires_csrf_token(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "user@example.com",
                "password": "safe-test-password-123",
                "password_confirmation": "safe-test-password-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_register_rejects_case_only_duplicate_email(self):
        get_user_model().objects.create_user(
            email="User@example.com",
            password="safe-test-password-123",
        )

        response = self.post_with_csrf(
            "/api/auth/register/",
            {
                "email": "user@EXAMPLE.com",
                "password": "another-safe-password-456",
                "password_confirmation": "another-safe-password-456",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.json()["errors"])

    def test_register_uses_django_password_validation(self):
        response = self.post_with_csrf(
            "/api/auth/register/",
            {
                "email": "user@example.com",
                "password": "12345678",
                "password_confirmation": "12345678",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.json()["errors"])

    def test_login_ignores_email_letter_case(self):
        get_user_model().objects.create_user(
            email="User@example.com",
            password="safe-test-password-123",
        )

        response = self.post_with_csrf(
            "/api/auth/login/",
            {
                "email": "user@EXAMPLE.com",
                "password": "safe-test-password-123",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["user"]["email"], "User@example.com")

    def test_logout_ends_session(self):
        get_user_model().objects.create_user(
            email="user@example.com",
            password="safe-test-password-123",
        )
        self.post_with_csrf(
            "/api/auth/login/",
            {
                "email": "user@example.com",
                "password": "safe-test-password-123",
            },
        )

        response = self.post_with_csrf("/api/auth/logout/", {})

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        session_response = self.client.get("/api/auth/me/")
        self.assertFalse(session_response.json()["is_authenticated"])

    def test_me_returns_guest_state_without_login(self):
        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            {"is_authenticated": False, "user": None},
        )

    def test_login_rate_limit_rejects_repeated_attempts(self):
        csrf_token = self.csrf_token()
        responses = [
            self.client.post(
                "/api/auth/login/",
                {
                    "email": "nobody@example.com",
                    "password": "incorrect-password",
                },
                format="json",
                HTTP_X_CSRFTOKEN=csrf_token,
            )
            for _ in range(11)
        ]

        self.assertEqual(responses[0].status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(responses[9].status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            responses[10].status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
