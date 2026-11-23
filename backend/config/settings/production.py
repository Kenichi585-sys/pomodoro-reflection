"""Cloud Run本番環境で使用するDjango設定。"""

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .environment import (
    require_environment_integer,
    require_environment_list,
    require_environment_variable,
)


SECRET_KEY = require_environment_variable("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = require_environment_list("DJANGO_ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = require_environment_list("DJANGO_CSRF_TRUSTED_ORIGINS")

if "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "本番環境のDJANGO_ALLOWED_HOSTSでアスタリスクによる全許可はできません。"
    )

database_config = dj_database_url.parse(
    require_environment_variable("DATABASE_URL"),
)
# 東京のCloud RunからNeonへ接続するたびにTLS接続を作り直さないよう、
# Gunicornの各スレッドで短時間だけDB接続を再利用する。
database_config["CONN_MAX_AGE"] = 30
database_options = database_config.get("OPTIONS", {})
ssl_mode = database_options.get("sslmode")
channel_binding = database_options.get("channel_binding")

if not (
    ssl_mode == "verify-full"
    or (ssl_mode == "require" and channel_binding == "require")
):
    raise ImproperlyConfigured(
        "本番環境のDATABASE_URLにはsslmode=verify-full、または"
        "sslmode=require&channel_binding=requireを設定してください。"
    )

DATABASES = {"default": database_config}

MIDDLEWARE = [  # noqa: F405
    MIDDLEWARE[0],  # noqa: F405
    "whitenoise.middleware.WhiteNoiseMiddleware",
    *MIDDLEWARE[1:],  # noqa: F405
]

STATIC_ROOT = BASE_DIR / "staticfiles"  # noqa: F405
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Viteで生成したPWA一式を、APIと同じURLのルートから配信する。
WHITENOISE_ROOT = BASE_DIR.parent / "frontend" / "dist"  # noqa: F405
WHITENOISE_INDEX_FILE = True
WHITENOISE_ALLOW_ALL_ORIGINS = False
WHITENOISE_MIMETYPES = {
    ".webmanifest": "application/manifest+json",
}


# Viteがファイル名へ内容のハッシュを付けた成果物だけを長期キャッシュする。
def is_vite_hashed_asset(_path: str, url: str) -> bool:
    return url.startswith("/assets/")


WHITENOISE_IMMUTABLE_FILE_TEST = is_vite_hashed_asset

REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    # Cloud Runの中継数を確認し、デプロイ時に環境変数で明示する。
    "NUM_PROXIES": require_environment_integer("DJANGO_NUM_PROXIES"),
}

# Cloud Runの外側で終了したHTTPS通信を、Djangoでも安全な通信として判定する。
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 3600
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
