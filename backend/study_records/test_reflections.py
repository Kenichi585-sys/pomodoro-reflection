import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import Reflection, StudyRecord, StudyTheme


class ReflectionApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="reflection@example.com",
            password="valid-test-password",
        )
        self.theme = StudyTheme.objects.create(
            user=self.user,
            name="プログラミング",
        )
        started_at = timezone.now()
        self.study_record = StudyRecord.objects.create(
            user=self.user,
            theme=self.theme,
            client_uuid=uuid.uuid4(),
            study_date=timezone.localdate(started_at),
            started_at=started_at,
            ended_at=started_at + timedelta(minutes=25),
            study_seconds=25 * 60,
            goal="Serializerの流れを理解する",
        )
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.csrf_token = self.client.get("/api/auth/csrf/").json()["csrf_token"]
        self.url = f"/api/study-records/{self.study_record.id}/reflection/"

    def post(self, payload):
        return self.client.post(
            self.url,
            payload,
            format="json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def patch(self, payload):
        return self.client.patch(
            self.url,
            payload,
            format="json",
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def delete(self):
        return self.client.delete(
            self.url,
            HTTP_X_CSRFTOKEN=self.csrf_token,
        )

    def test_create_and_update_reflection(self):
        response = self.post(
            {
                "worked_on": "Serializerの流れを読んだ",
                "learned": "検証後のデータを使うと分かった",
                "impressions": "思っていたより流れは単純だった",
                "next_action": "短い記事にまとめる",
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.json()["impressions"],
            "思っていたより流れは単純だった",
        )
        self.assertEqual(Reflection.objects.count(), 1)

        update_response = self.patch({"next_action": "記事を読み返す"})

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.json()["next_action"], "記事を読み返す")

        delete_response = self.delete()

        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Reflection.objects.exists())
        self.assertTrue(StudyRecord.objects.filter(id=self.study_record.id).exists())

    def test_rejects_empty_reflection_with_common_error_shape(self):
        response = self.post({})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.json()["errors"])
        self.assertFalse(Reflection.objects.exists())

    def test_replay_conflict_and_other_users_record(self):
        payload = {"worked_on": "APIを読んだ"}
        first_response = self.post(payload)
        replay_response = self.post(payload)
        duplicate_response = self.post({"worked_on": "別の内容"})

        other_user = get_user_model().objects.create_user(
            email="other-reflection@example.com",
            password="valid-test-password",
        )
        self.client.force_login(other_user)
        other_csrf_token = self.client.get("/api/auth/csrf/").json()["csrf_token"]
        forbidden_response = self.client.patch(
            self.url,
            {"worked_on": "他人の内容を変更する"},
            format="json",
            HTTP_X_CSRFTOKEN=other_csrf_token,
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(replay_response.status_code, status.HTTP_200_OK)
        self.assertEqual(duplicate_response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(forbidden_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Reflection.objects.count(), 1)
