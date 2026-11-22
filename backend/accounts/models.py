from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower

from .managers import UserManager


# ユーザー名を使わず、メールアドレスをログインIDとして扱う利用者モデル。
class User(AbstractUser):
    username = None
    email = models.EmailField("メールアドレス", unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta(AbstractUser.Meta):
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_unique",
            ),
        ]

    def __str__(self):
        return self.email
