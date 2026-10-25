from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    """メールアドレスをログインIDとして扱うユーザーマネージャー。"""

    use_in_migrations = True

    def get_by_natural_key(self, username):
        return self.get(email__iexact=username)

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("メールアドレスは必須です。")

        user = self.model(email=email.strip(), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("管理者はis_staff=Trueである必要があります。")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("管理者はis_superuser=Trueである必要があります。")

        return self._create_user(email, password, **extra_fields)

