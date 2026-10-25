from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase


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
