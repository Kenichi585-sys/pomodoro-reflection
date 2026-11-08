from django.utils import timezone
from rest_framework import serializers

from .models import StudyRecord


PRESET_DURATIONS = {
    StudyRecord.Preset.POMODORO: (25 * 60, 5 * 60),
    StudyRecord.Preset.FIFTY_TWO_SEVENTEEN: (52 * 60, 17 * 60),
}


class StudyRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyRecord
        fields = (
            "id",
            "client_uuid",
            "study_date",
            "started_at",
            "ended_at",
            "study_seconds",
            "preset",
            "focus_seconds",
            "break_seconds",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "study_date", "created_at", "updated_at")

    def validate(self, attrs):
        started_at = attrs["started_at"]
        ended_at = attrs["ended_at"]
        study_seconds = attrs["study_seconds"]

        if ended_at < started_at:
            raise serializers.ValidationError(
                {"ended_at": "終了日時は開始日時以降にしてください。"}
            )
        if study_seconds > (ended_at - started_at).total_seconds():
            raise serializers.ValidationError(
                {
                    "study_seconds": (
                        "学習秒数は開始日時から終了日時までの範囲内にしてください。"
                    )
                }
            )

        expected_focus_seconds, expected_break_seconds = PRESET_DURATIONS[
            attrs["preset"]
        ]
        duration_errors = {}
        if attrs["focus_seconds"] != expected_focus_seconds:
            duration_errors["focus_seconds"] = "プリセットの学習時間と一致しません。"
        if attrs["break_seconds"] != expected_break_seconds:
            duration_errors["break_seconds"] = "プリセットの休憩時間と一致しません。"
        if duration_errors:
            raise serializers.ValidationError(duration_errors)

        return attrs

    def create(self, validated_data):
        validated_data["study_date"] = timezone.localdate(
            validated_data["started_at"]
        )
        return super().create(validated_data)
