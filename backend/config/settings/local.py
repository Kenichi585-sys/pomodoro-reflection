"""ローカル開発で使用するDjango設定。"""

from dotenv import load_dotenv

from .base import *  # noqa: F403
from .environment import (
    require_environment_integer,
    require_environment_list,
    require_environment_variable,
)


load_dotenv(BASE_DIR.parent / ".env")  # noqa: F405

SECRET_KEY = require_environment_variable("DJANGO_SECRET_KEY")
DEBUG = True
ALLOWED_HOSTS = require_environment_list("DJANGO_ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = require_environment_list("DJANGO_CSRF_TRUSTED_ORIGINS")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": require_environment_variable("POSTGRES_DB"),
        "USER": require_environment_variable("POSTGRES_USER"),
        "PASSWORD": require_environment_variable("POSTGRES_PASSWORD"),
        "HOST": require_environment_variable("POSTGRES_HOST"),
        "PORT": require_environment_variable("POSTGRES_PORT"),
    }
}

REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    # ローカルでは、利用者が自由に設定できるX-Forwarded-Forを信用しない。
    "NUM_PROXIES": require_environment_integer("DJANGO_NUM_PROXIES"),
}

SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
