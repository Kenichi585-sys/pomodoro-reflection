import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import RestrictedError
from django.test import TestCase
from django.utils import timezone

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
