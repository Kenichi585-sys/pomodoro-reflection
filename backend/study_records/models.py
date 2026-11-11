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


class Reflection(models.Model):
    class AiUsageState(models.TextChoices):
        UNANSWERED = "unanswered", "未回答"
        USED = "used", "使用"
        UNUSED = "unused", "未使用"

    study_record = models.OneToOneField(
        StudyRecord,
        on_delete=models.CASCADE,
        related_name="reflection",
    )
    worked_on = models.TextField("今回取り組んだこと", blank=True)
    difficulty = models.TextField("引っかかったこと", blank=True)
    attempted = models.TextField("試したこと", blank=True)
    understanding_change = models.TextField("理解の変化", blank=True)
    next_action = models.TextField("次に行う具体的な行動", blank=True)
    ai_usage_state = models.CharField(
        "AI利用状態",
        max_length=10,
        choices=AiUsageState.choices,
        default=AiUsageState.UNANSWERED,
    )
    ai_communication_score = models.PositiveSmallIntegerField(
        "AIへ考えなどを伝えた度合い",
        null=True,
        blank=True,
    )
    ai_thinking_score = models.PositiveSmallIntegerField(
        "AI利用中に自分で考えた実感",
        null=True,
        blank=True,
    )
    outcome_score = models.PositiveSmallIntegerField(
        "成果や良い影響の実感",
        null=True,
        blank=True,
    )
    outcome_evidence = models.TextField(
        "成果や良い影響についての具体的な出来事・変化",
        blank=True,
    )
    created_at = models.DateTimeField("作成日時", auto_now_add=True)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    def __str__(self):
        return f"{self.study_record}の振り返り"


class ReflectionDeepDive(models.Model):
    reflection = models.ForeignKey(
        Reflection,
        on_delete=models.CASCADE,
        related_name="deep_dives",
    )
    content = models.TextField("内容")
    display_order = models.PositiveIntegerField("表示順")
    created_at = models.DateTimeField("作成日時", auto_now_add=True)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    class Meta:
        ordering = ["display_order"]
        constraints = [
            models.UniqueConstraint(
                fields=["reflection", "display_order"],
                name="reflection_deep_dive_order_unique",
            ),
        ]

    def __str__(self):
        return f"{self.reflection} - {self.display_order}"
