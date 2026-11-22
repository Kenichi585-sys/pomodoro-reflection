"""環境変数をDjango設定で安全に読み取る補助関数。"""

import os

from django.core.exceptions import ImproperlyConfigured


def require_environment_variable(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"環境変数 {name} を設定してください。")
    return value


def require_environment_list(name: str) -> list[str]:
    values = [
        value.strip()
        for value in require_environment_variable(name).split(",")
        if value.strip()
    ]
    if not values:
        raise ImproperlyConfigured(f"環境変数 {name} に1件以上設定してください。")
    return values


def require_environment_integer(name: str) -> int:
    value = require_environment_variable(name)
    try:
        return int(value)
    except ValueError as error:
        raise ImproperlyConfigured(
            f"環境変数 {name} には整数を設定してください。"
        ) from error
