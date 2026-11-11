from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DEFAULT_STUDY_THEME_NAME, Reflection, StudyRecord, StudyTheme
from .serializers import ReflectionSerializer, StudyRecordSerializer


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
        if hasattr(study_record, "reflection"):
            return Response(
                {"errors": {"non_field_errors": ["振り返りはすでに存在します。"]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ReflectionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            reflection = serializer.save(study_record=study_record)
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
