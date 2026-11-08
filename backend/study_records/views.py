from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DEFAULT_STUDY_THEME_NAME, StudyRecord, StudyTheme
from .serializers import StudyRecordSerializer


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
