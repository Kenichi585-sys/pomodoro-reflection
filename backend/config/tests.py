import importlib
import os
import sys
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from rest_framework import status
from rest_framework.test import APISimpleTestCase


class HealthCheckTests(APISimpleTestCase):
    def test_health_check_is_public(self):
        response = self.client.get("/api/health/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), {"status": "ok"})


class ProductionSettingsTests(APISimpleTestCase):
    environment = {
        "DJANGO_SECRET_KEY": "production-settings-test-only-secret",
        "DATABASE_URL": (
            "postgresql://user:password@db.example.com/database"
            "?sslmode=require&channel_binding=require"
        ),
        "DJANGO_ALLOWED_HOSTS": "example.run.app",
        "DJANGO_CSRF_TRUSTED_ORIGINS": "https://example.run.app",
        "DJANGO_NUM_PROXIES": "1",
    }

    def load_production_settings(self):
        sys.modules.pop("config.settings.production", None)
        with patch.dict(os.environ, self.environment, clear=False):
            return importlib.import_module("config.settings.production")

    def test_rejects_wildcard_allowed_hosts(self):
        environment = {
            **self.environment,
            "DJANGO_ALLOWED_HOSTS": "*",
        }
        sys.modules.pop("config.settings.production", None)

        with patch.dict(os.environ, environment, clear=False):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "アスタリスクによる全許可はできません",
            ):
                importlib.import_module("config.settings.production")

    def test_preserves_secure_database_connection_options(self):
        production = self.load_production_settings()

        self.assertEqual(
            production.DATABASES["default"]["OPTIONS"],
            {
                "sslmode": "require",
                "channel_binding": "require",
            },
        )

    def test_reuses_production_database_connections_briefly(self):
        production = self.load_production_settings()

        self.assertEqual(
            production.DATABASES["default"]["CONN_MAX_AGE"],
            30,
        )

    def test_rejects_database_url_without_server_authentication(self):
        environment = {
            **self.environment,
            "DATABASE_URL": (
                "postgresql://user:password@db.example.com/database"
                "?sslmode=require"
            ),
        }
        sys.modules.pop("config.settings.production", None)

        with patch.dict(os.environ, environment, clear=False):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "channel_binding=require",
            ):
                importlib.import_module("config.settings.production")

    def test_accepts_verify_full_database_connection(self):
        environment = {
            **self.environment,
            "DATABASE_URL": (
                "postgresql://user:password@db.example.com/database"
                "?sslmode=verify-full"
            ),
        }
        sys.modules.pop("config.settings.production", None)

        with patch.dict(os.environ, environment, clear=False):
            production = importlib.import_module("config.settings.production")

        self.assertEqual(
            production.DATABASES["default"]["OPTIONS"]["sslmode"],
            "verify-full",
        )

    def test_configures_whitenoise_for_django_and_vite_files(self):
        production = self.load_production_settings()

        self.assertEqual(
            production.MIDDLEWARE[:2],
            [
                "django.middleware.security.SecurityMiddleware",
                "whitenoise.middleware.WhiteNoiseMiddleware",
            ],
        )
        self.assertEqual(production.STATIC_ROOT, production.BASE_DIR / "staticfiles")
        self.assertEqual(
            production.WHITENOISE_ROOT,
            production.BASE_DIR.parent / "frontend" / "dist",
        )
        self.assertTrue(production.WHITENOISE_INDEX_FILE)
        self.assertFalse(production.WHITENOISE_ALLOW_ALL_ORIGINS)
        self.assertEqual(
            production.WHITENOISE_MIMETYPES[".webmanifest"],
            "application/manifest+json",
        )
        self.assertTrue(
            production.WHITENOISE_IMMUTABLE_FILE_TEST(
                "/app/frontend/dist/assets/index-hash.js",
                "/assets/index-hash.js",
            )
        )
        self.assertFalse(
            production.WHITENOISE_IMMUTABLE_FILE_TEST(
                "/app/frontend/dist/sw.js",
                "/sw.js",
            )
        )
