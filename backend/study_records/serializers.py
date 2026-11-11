from django.utils import timezone
from rest_framework import serializers

from .models import StudyRecord


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

        return attrs

    def create(self, validated_data):
        validated_data["study_date"] = timezone.localdate(
            validated_data["started_at"]
        )
        return super().create(validated_data)
