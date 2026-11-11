from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DEFAULT_STUDY_THEME_NAME, Reflection, StudyRecord, StudyTheme
from .serializers import ReflectionSerializer, StudyRecordSerializer


REFLECTION_VALUE_FIELDS = (
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
)


def reflection_matches_input(reflection, validated_data):
    for field_name in REFLECTION_VALUE_FIELDS:
        model_field = Reflection._meta.get_field(field_name)
        input_value = validated_data.get(field_name, model_field.get_default())
        if getattr(reflection, field_name) != input_value:
            return False

    input_deep_dives = [
        deep_dive["content"] for deep_dive in validated_data.get("deep_dives", [])
    ]
    saved_deep_dives = list(
        reflection.deep_dives.order_by("display_order").values_list(
            "content", flat=True
        )
    )
    return input_deep_dives == saved_deep_dives


def reflection_conflict_response():
    return Response(
        {"errors": {"non_field_errors": ["振り返りはすでに存在します。"]}},
        status=status.HTTP_409_CONFLICT,
    )


class StudyRecordCreateView(APIView):
    def post(self, request):
        serializer = StudyRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client_uuid = serializer.validated_data["client_uuid"]
        existing_record = StudyRecord.objects.filter(
            user=request.user,
            client_uuid=client_uuid,
        ).first()
        if existing_record is not None:
            return Response(StudyRecordSerializer(existing_record).data)

        theme = StudyTheme.objects.get(
            user=request.user,
            name=DEFAULT_STUDY_THEME_NAME,
        )
        try:
            with transaction.atomic():
                record = serializer.save(user=request.user, theme=theme)
        except (DjangoValidationError, IntegrityError):
            record = StudyRecord.objects.filter(
                user=request.user,
                client_uuid=client_uuid,
            ).first()
            if record is None:
                raise
            return Response(StudyRecordSerializer(record).data)

        return Response(
            StudyRecordSerializer(record).data,
            status=status.HTTP_201_CREATED,
        )


class ReflectionView(APIView):
    @staticmethod
    def get_study_record(request, study_record_id):
        return get_object_or_404(
            StudyRecord,
            id=study_record_id,
            user=request.user,
        )

    def post(self, request, study_record_id):
        study_record = self.get_study_record(request, study_record_id)
        serializer = ReflectionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        validated_data = dict(serializer.validated_data)
        validated_data["deep_dives"] = [
            dict(deep_dive)
            for deep_dive in serializer.validated_data.get("deep_dives", [])
        ]

        existing_reflection = (
            Reflection.objects.prefetch_related("deep_dives")
            .filter(study_record=study_record)
            .first()
        )
        if existing_reflection is not None:
            if reflection_matches_input(existing_reflection, validated_data):
                return Response(ReflectionSerializer(existing_reflection).data)
            return reflection_conflict_response()

        try:
            with transaction.atomic():
                reflection = serializer.save(study_record=study_record)
        except IntegrityError:
            existing_reflection = (
                Reflection.objects.prefetch_related("deep_dives")
                .filter(study_record=study_record)
                .first()
            )
            if existing_reflection is None:
                raise
            if reflection_matches_input(existing_reflection, validated_data):
                return Response(ReflectionSerializer(existing_reflection).data)
            return reflection_conflict_response()
        return Response(
            ReflectionSerializer(reflection).data,
            status=status.HTTP_201_CREATED,
        )

    def patch(self, request, study_record_id):
        study_record = self.get_study_record(request, study_record_id)
        reflection = get_object_or_404(
            Reflection.objects.prefetch_related("deep_dives"),
            study_record=study_record,
        )
        serializer = ReflectionSerializer(
            reflection,
            data=request.data,
            partial=True,
        )
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            reflection = serializer.save()
        return Response(ReflectionSerializer(reflection).data)
