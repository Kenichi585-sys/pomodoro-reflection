from django.utils import timezone
from rest_framework import serializers

from .models import Reflection, StudyRecord


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
            "goal",
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


class ReflectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reflection
        fields = (
            "id",
            "worked_on",
            "learned",
            "next_action",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate(self, attrs):
        def current_value(field_name):
            if field_name in attrs:
                return attrs[field_name]
            if self.instance is not None:
                return getattr(self.instance, field_name)
            return None

        if not any(
            (current_value(field_name) or "").strip()
            for field_name in ("worked_on", "learned", "next_action")
        ):
            raise serializers.ValidationError(
                {"non_field_errors": "振り返りを1項目以上入力してください。"}
            )
        return attrs


class StudyRecordHistorySerializer(serializers.ModelSerializer):
    reflection = serializers.SerializerMethodField()

    class Meta:
        model = StudyRecord
        fields = (
            "id",
            "study_date",
            "started_at",
            "ended_at",
            "study_seconds",
            "goal",
            "reflection",
        )

    @staticmethod
    def get_reflection(study_record):
        try:
            reflection = study_record.reflection
        except Reflection.DoesNotExist:
            return None
        return ReflectionSerializer(reflection).data
