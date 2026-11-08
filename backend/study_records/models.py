from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


DEFAULT_STUDY_THEME_NAME = "プログラミング"


class StudyTheme(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="study_themes",
    )
    name = models.CharField("テーマ名", max_length=100)
    created_at = models.DateTimeField("作成日時", auto_now_add=True)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if not self.pk or not self.user_id:
            return

        previous_user_id = (
            StudyTheme.objects.filter(pk=self.pk)
            .values_list("user_id", flat=True)
            .first()
        )
        if (
            previous_user_id is not None
            and previous_user_id != self.user_id
            and self.study_records.exists()
        ):
            raise ValidationError(
                {"user": "学習記録があるテーマの所有者は変更できません。"}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class StudyRecord(models.Model):
    class Preset(models.TextChoices):
        POMODORO = "25-5", "25分 / 5分"
        FIFTY_TWO_SEVENTEEN = "52-17", "52分 / 17分"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="study_records",
    )
    theme = models.ForeignKey(
        StudyTheme,
        on_delete=models.RESTRICT,
        related_name="study_records",
    )
    client_uuid = models.UUIDField("重複防止UUID")
    study_date = models.DateField("学習日")
    started_at = models.DateTimeField("開始日時")
    ended_at = models.DateTimeField("終了日時")
    study_seconds = models.PositiveIntegerField("学習秒数")
    preset = models.CharField("プリセット", max_length=5, choices=Preset.choices)
    focus_seconds = models.PositiveIntegerField("設定学習秒数")
    break_seconds = models.PositiveIntegerField("設定休憩秒数")
    completed_focus_count = models.PositiveIntegerField("完了した学習回数")
    created_at = models.DateTimeField("作成日時", auto_now_add=True)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "client_uuid"],
                name="study_record_user_client_uuid_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(ended_at__gte=models.F("started_at")),
                name="study_record_end_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=["user", "study_date"],
                name="study_record_user_date_idx",
            ),
        ]

    def __str__(self):
        return f"{self.user} - {self.study_date} - {self.study_seconds}秒"

    def clean(self):
        super().clean()
        errors = {}

        if self.user_id and self.theme_id:
            theme_user_id = (
                StudyTheme.objects.filter(pk=self.theme_id)
                .values_list("user_id", flat=True)
                .first()
            )
            if theme_user_id is not None and theme_user_id != self.user_id:
                errors["theme"] = "自分が所有する学習テーマを指定してください。"

        if self.started_at and self.ended_at:
            if self.ended_at < self.started_at:
                errors["ended_at"] = "終了日時は開始日時以降にしてください。"
            elif (
                self.study_seconds is not None
                and self.study_seconds
                > (self.ended_at - self.started_at).total_seconds()
            ):
                errors["study_seconds"] = (
                    "学習秒数は開始日時から終了日時までの範囲内にしてください。"
                )

        if self.study_date and self.started_at:
            started_at = (
                timezone.localtime(self.started_at)
                if timezone.is_aware(self.started_at)
                else self.started_at
            )
            if self.study_date != started_at.date():
                errors["study_date"] = "学習日は開始日時の日付と一致させてください。"

        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
