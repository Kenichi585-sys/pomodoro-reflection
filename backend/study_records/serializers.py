from django.utils import timezone
from rest_framework import serializers

from .models import Reflection, ReflectionDeepDive, StudyRecord


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


class ReflectionDeepDiveSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReflectionDeepDive
        fields = ("id", "content", "display_order")
        read_only_fields = ("id", "display_order")


class ReflectionSerializer(serializers.ModelSerializer):
    deep_dives = ReflectionDeepDiveSerializer(many=True, required=False)

    class Meta:
        model = Reflection
        fields = (
            "id",
            "worked_on",
            "difficulty",
            "attempted",
            "understanding_change",
            "next_action",
            "ai_usage_state",
            "ai_communication_score",
            "ai_thinking_score",
            "outcome_score",
            "outcome_evidence",
            "deep_dives",
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

        difficulty = current_value("difficulty") or ""
        attempted = current_value("attempted") or ""
        understanding_change = current_value("understanding_change") or ""
        next_action = current_value("next_action") or ""
        ai_usage_state = (
            current_value("ai_usage_state") or Reflection.AiUsageState.UNANSWERED
        )
        ai_communication_score = current_value("ai_communication_score")
        ai_thinking_score = current_value("ai_thinking_score")

        errors = {}
        if attempted and not difficulty:
            errors["attempted"] = "先に引っかかったことを入力してください。"
        if understanding_change and not attempted:
            errors["understanding_change"] = "先に試したことを入力してください。"

        for field_name in (
            "ai_communication_score",
            "ai_thinking_score",
            "outcome_score",
        ):
            score = current_value(field_name)
            if score is not None and (score < 0 or score > 100 or score % 10 != 0):
                errors[field_name] = "0から100までの10刻みで選択してください。"

        has_ai_score = (
            ai_communication_score is not None or ai_thinking_score is not None
        )
        if ai_usage_state == Reflection.AiUsageState.USED and not has_ai_score:
            errors["ai_usage_state"] = "AIに関する回答を1項目以上選択してください。"
        elif ai_usage_state != Reflection.AiUsageState.USED and has_ai_score:
            errors["ai_usage_state"] = "AI利用状態と回答内容が一致していません。"

        deep_dives = attrs.get("deep_dives")
        if deep_dives is None and self.instance is not None:
            has_deep_dives = self.instance.deep_dives.exists()
        else:
            has_deep_dives = bool(deep_dives)
        if has_deep_dives and not next_action:
            errors["deep_dives"] = "先に次に行う具体的な行動を入力してください。"

        text_fields = (
            "worked_on",
            "difficulty",
            "attempted",
            "understanding_change",
            "next_action",
            "outcome_evidence",
        )
        has_text = any(current_value(field_name) for field_name in text_fields)
        has_score = any(
            current_value(field_name) is not None
            for field_name in (
                "ai_communication_score",
                "ai_thinking_score",
                "outcome_score",
            )
        )
        if (
            not has_text
            and not has_score
            and not has_deep_dives
            and ai_usage_state == Reflection.AiUsageState.UNANSWERED
        ):
            errors["non_field_errors"] = "振り返りを1項目以上入力してください。"

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    @staticmethod
    def replace_deep_dives(reflection, deep_dives):
        reflection.deep_dives.all().delete()
        ReflectionDeepDive.objects.bulk_create(
            [
                ReflectionDeepDive(
                    reflection=reflection,
                    content=deep_dive["content"],
                    display_order=index,
                )
                for index, deep_dive in enumerate(deep_dives)
            ]
        )

    def create(self, validated_data):
        deep_dives = validated_data.pop("deep_dives", [])
        reflection = Reflection.objects.create(**validated_data)
        self.replace_deep_dives(reflection, deep_dives)
        return reflection

    def update(self, instance, validated_data):
        deep_dives = validated_data.pop("deep_dives", None)
        for field_name, value in validated_data.items():
            setattr(instance, field_name, value)
        instance.save()
        if deep_dives is not None:
            self.replace_deep_dives(instance, deep_dives)
        return instance
