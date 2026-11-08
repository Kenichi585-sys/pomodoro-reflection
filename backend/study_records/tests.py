import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import RestrictedError
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import StudyRecord, StudyTheme


class StudyRecordModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="learner@example.com",
            password="valid-test-password",
        )
        self.theme = StudyTheme.objects.create(
            user=self.user,
            name="プログラミング",
        )

    def build_record(self, client_uuid=None, **overrides):
        started_at = timezone.now()
        values = {
            "user": self.user,
            "theme": self.theme,
            "client_uuid": client_uuid or uuid.uuid4(),
            "study_date": timezone.localdate(started_at),
            "started_at": started_at,
            "ended_at": started_at + timedelta(minutes=25),
            "study_seconds": 25 * 60,
            "preset": StudyRecord.Preset.POMODORO,
            "focus_seconds": 25 * 60,
            "break_seconds": 5 * 60,
            "completed_focus_count": 1,
        }
        values.update(overrides)
        return StudyRecord(**values)

    def create_record(self, client_uuid=None, **overrides):
        record = self.build_record(client_uuid, **overrides)
        record.save()
        return record

    def test_study_record_is_linked_to_user_and_theme(self):
        record = self.create_record(uuid.uuid4())

        self.assertEqual(record.user, self.user)
        self.assertEqual(record.theme, self.theme)
        self.assertEqual(record.study_seconds, 25 * 60)

    def test_client_uuid_cannot_be_duplicated_for_same_user(self):
        client_uuid = uuid.uuid4()
        self.create_record(client_uuid)
        duplicate_record = self.build_record(client_uuid)

        with self.assertRaises(IntegrityError), transaction.atomic():
            StudyRecord.objects.bulk_create([duplicate_record])

    def test_record_rejects_theme_owned_by_another_user(self):
        other_user = get_user_model().objects.create_user(
            email="other@example.com",
            password="valid-test-password",
        )
        other_theme = StudyTheme.objects.create(
            user=other_user,
            name="プログラミング",
        )

        with self.assertRaises(ValidationError):
            self.create_record(theme=other_theme)

    def test_theme_is_protected_but_user_can_be_deleted(self):
        self.create_record()
        other_user = get_user_model().objects.create_user(
            email="other@example.com",
            password="valid-test-password",
        )

        self.theme.user = other_user
        with self.assertRaises(ValidationError):
            self.theme.save()
        self.theme.refresh_from_db()
        self.assertEqual(self.theme.user, self.user)

        with self.assertRaises(RestrictedError):
            self.theme.delete()

        self.user.delete()
        self.assertFalse(StudyRecord.objects.exists())
        self.assertFalse(StudyTheme.objects.exists())

    def test_record_rejects_inconsistent_date_time_and_study_seconds(self):
        started_at = timezone.now()
        invalid_values = (
            {"study_date": timezone.localdate(started_at) - timedelta(days=1)},
            {"ended_at": started_at - timedelta(seconds=1)},
            {
                "ended_at": started_at + timedelta(minutes=1),
                "study_seconds": 61,
            },
        )

        for overrides in invalid_values:
            with self.subTest(overrides=overrides), self.assertRaises(ValidationError):
                self.create_record(started_at=started_at, **overrides)


class StudyRecordCreateApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="api-learner@example.com",
            password="valid-test-password",
        )
        self.theme = StudyTheme.objects.create(
            user=self.user,
            name="プログラミング",
        )
        self.client = APIClient(enforce_csrf_checks=True)
        self.started_at = timezone.now()
        self.payload = {
            "client_uuid": str(uuid.uuid4()),
            "started_at": self.started_at.isoformat(),
            "ended_at": (self.started_at + timedelta(minutes=25)).isoformat(),
            "study_seconds": 25 * 60,
            "preset": StudyRecord.Preset.POMODORO,
            "focus_seconds": 25 * 60,
            "break_seconds": 5 * 60,
            "completed_focus_count": 1,
        }

    def test_authenticated_user_can_create_record_without_duplication(self):
        self.client.force_login(self.user)
        csrf_response = self.client.get("/api/auth/csrf/")
        csrf_token = csrf_response.json()["csrf_token"]

        missing_csrf_response = self.client.post(
            "/api/study-records/",
            self.payload,
            format="json",
        )

        first_response = self.client.post(
            "/api/study-records/",
            self.payload,
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        second_response = self.client.post(
            "/api/study-records/",
            self.payload,
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(
            missing_csrf_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(first_response.json()["id"], second_response.json()["id"])
        self.assertEqual(StudyRecord.objects.count(), 1)
        record = StudyRecord.objects.get()
        self.assertEqual(record.user, self.user)
        self.assertEqual(record.theme, self.theme)
        self.assertEqual(record.study_date, timezone.localdate(self.started_at))

        inconsistent_response = self.client.post(
            "/api/study-records/",
            {
                **self.payload,
                "client_uuid": str(uuid.uuid4()),
                "study_seconds": 1,
                "completed_focus_count": 4,
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(
            inconsistent_response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(StudyRecord.objects.count(), 1)

    def test_guest_cannot_create_record(self):
        response = self.client.post(
            "/api/study-records/",
            self.payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(StudyRecord.objects.exists())
