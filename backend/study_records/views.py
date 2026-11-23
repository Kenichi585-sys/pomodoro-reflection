from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DEFAULT_STUDY_THEME_NAME, Reflection, StudyRecord, StudyTheme
from .serializers import (
    ReflectionSerializer,
    StudyRecordHistorySerializer,
    StudyRecordSerializer,
)


REFLECTION_VALUE_FIELDS = (
    "worked_on",
    "learned",
    "impressions",
    "next_action",
)


# すでに保存されている振り返りと、今回送られた内容が同じか確認する。
def reflection_matches_input(reflection, validated_data):
    for field_name in REFLECTION_VALUE_FIELDS:
        model_field = Reflection._meta.get_field(field_name)
        input_value = validated_data.get(field_name, model_field.get_default())
        if getattr(reflection, field_name) != input_value:
            return False

    return True


# 内容が異なる振り返りがすでに存在する場合のエラーを返す。
def reflection_conflict_response():
    return Response(
        {"errors": {"non_field_errors": ["振り返りはすでに存在します。"]}},
        status=status.HTTP_409_CONFLICT,
    )


# Reactから受け取った学習記録を、ログイン中の利用者の記録として保存するAPI。
class StudyRecordCreateView(APIView):
    def post(self, request):
        serializer = StudyRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        client_uuid = serializer.validated_data["client_uuid"]
        # 同じ記録がすでに保存されていないか確認する
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


# ログイン中の利用者が指定日に保存した学習時間の合計を返すAPI。
class TodayStudySummaryView(APIView):
    def get(self, request):
        requested_study_date = request.query_params.get("study_date")
        study_date = (
            serializers.DateField().run_validation(requested_study_date)
            if requested_study_date is not None
            else timezone.localdate()
        )
        study_seconds = (
            StudyRecord.objects.filter(
                user=request.user,
                study_date=study_date,
            ).aggregate(total=Sum("study_seconds"))["total"]
            or 0
        )
        return Response({"study_seconds": study_seconds})


# ログイン中の利用者が指定した学習記録を削除するAPI。
class StudyRecordDeleteView(APIView):
    def delete(self, request, study_record_id):
        StudyRecord.objects.filter(
            id=study_record_id,
            user=request.user,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ログイン中の利用者の学習記録と振り返りを、日付ごとにまとめてReactに返すAPI。
class StudyRecordHistoryView(APIView):
    page_size = 20

    def get(self, request):
        user_records = StudyRecord.objects.filter(user=request.user)
        try:
            offset = int(request.query_params.get("offset", "0"))
        except ValueError as error:
            raise serializers.ValidationError(
                {"offset": "0以上の整数を指定してください。"}
            ) from error
        if offset < 0:
            raise serializers.ValidationError(
                {"offset": "0以上の整数を指定してください。"}
            )

        study_dates = list(
            user_records
            .order_by("-study_date")
            .values_list("study_date", flat=True)
            .distinct()[offset : offset + self.page_size + 1]
        )
        has_more = len(study_dates) > self.page_size
        selected_dates = study_dates[: self.page_size]
        records = (
            StudyRecord.objects.filter(
                user=request.user,
                study_date__in=selected_dates,
            )
            .select_related("reflection")
            .order_by("-started_at")
        )

        records_by_date = {study_date: [] for study_date in selected_dates}
        for record in records:
            records_by_date[record.study_date].append(record)

        groups = []
        for study_date in selected_dates:
            date_records = records_by_date[study_date]
            groups.append(
                {
                    "study_date": study_date.isoformat(),
                    "study_seconds": sum(
                        record.study_seconds for record in date_records
                    ),
                    "records": StudyRecordHistorySerializer(
                        date_records,
                        many=True,
                    ).data,
                }
            )

        return Response(
            {
                "total_study_seconds": (
                    user_records.aggregate(total=Sum("study_seconds"))["total"]
                    or 0
                ),
                "groups": groups,
                "next_offset": (
                    offset + self.page_size if has_more else None
                ),
            }
        )


# 指定した学習記録の振り返りを作成・編集・削除するAPI。
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
        serializer.is_valid(raise_exception=True)
        validated_data = dict(serializer.validated_data)

        existing_reflection = Reflection.objects.filter(
            study_record=study_record
        ).first()
        if existing_reflection is not None:
            if reflection_matches_input(existing_reflection, validated_data):
                return Response(ReflectionSerializer(existing_reflection).data)
            return reflection_conflict_response()

        try:
            with transaction.atomic():
                reflection = serializer.save(study_record=study_record)
        except IntegrityError:
            existing_reflection = Reflection.objects.filter(
                study_record=study_record
            ).first()
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
            Reflection,
            study_record=study_record,
        )
        serializer = ReflectionSerializer(
            reflection,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            reflection = serializer.save()
        return Response(ReflectionSerializer(reflection).data)

    def delete(self, request, study_record_id):
        study_record = self.get_study_record(request, study_record_id)
        Reflection.objects.filter(study_record=study_record).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
