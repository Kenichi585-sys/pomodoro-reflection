import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import Reflection, ReflectionDeepDive, StudyRecord, StudyTheme


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

    def test_create_and_update_reflection_with_ordered_deep_dives(self):
        response = self.post(
            {
                "worked_on": "Serializerの流れを読んだ",
                "difficulty": "validated_dataの受け渡し",
                "attempted": "処理を順番に書き出した",
                "understanding_change": "検証後のデータだと分かった",
                "next_action": "短い記事にまとめる",
                "ai_usage_state": "used",
                "ai_communication_score": 70,
                "ai_thinking_score": 80,
                "outcome_score": 60,
                "outcome_evidence": "以前よりAPIの流れを説明できた",
                "deep_dives": [
                    {"content": "コード例を一つ選ぶ"},
                    {"content": "自分の言葉で説明する"},
                ],
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Reflection.objects.count(), 1)
        self.assertEqual(
            [item["display_order"] for item in response.json()["deep_dives"]],
            [0, 1],
        )

        update_response = self.patch(
            {
                "outcome_score": 70,
                "deep_dives": [{"content": "記事を読み返して説明する"}],
            }
        )

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.json()["outcome_score"], 70)
        self.assertEqual(ReflectionDeepDive.objects.count(), 1)
        self.assertEqual(
            update_response.json()["deep_dives"][0]["content"],
            "記事を読み返して説明する",
        )

    def test_ai_unused_can_save_outcome_but_not_ai_scores(self):
        valid_response = self.post(
            {
                "ai_usage_state": "unused",
                "outcome_score": 50,
                "outcome_evidence": "作業時間を短縮できた",
            }
        )

        self.assertEqual(valid_response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(valid_response.json()["ai_thinking_score"])

        Reflection.objects.filter(study_record=self.study_record).delete()
        thinking_only_response = self.post(
            {
                "ai_usage_state": "used",
                "ai_thinking_score": 50,
            }
        )
        self.assertEqual(thinking_only_response.status_code, status.HTTP_201_CREATED)

        Reflection.objects.filter(study_record=self.study_record).delete()
        invalid_response = self.post(
            {
                "ai_usage_state": "unused",
                "ai_thinking_score": 50,
            }
        )
        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("ai_usage_state", invalid_response.json()["errors"])

    def test_rejects_invalid_score_empty_reflection_and_broken_input_order(self):
        invalid_payloads = (
            ({"outcome_score": 55}, "outcome_score"),
            ({}, "non_field_errors"),
            ({"attempted": "先に試したことだけを書いた"}, "attempted"),
            (
                {
                    "deep_dives": [{"content": "深掘りだけを書いた"}],
                },
                "deep_dives",
            ),
        )

        for payload, error_field in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.post(payload)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(error_field, response.json()["errors"])
        self.assertFalse(Reflection.objects.exists())

    def test_replaying_same_reflection_returns_saved_reflection(self):
        payload = {
            "worked_on": "APIを読んだ",
            "next_action": "同じ内容を説明する",
            "deep_dives": [{"content": "短い例を作る"}],
        }
        first_response = self.post(payload)
        replay_response = self.post(payload)

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(replay_response.status_code, status.HTTP_200_OK)
        self.assertEqual(replay_response.json()["id"], first_response.json()["id"])
        self.assertEqual(Reflection.objects.count(), 1)
        self.assertEqual(ReflectionDeepDive.objects.count(), 1)

    def test_cannot_overwrite_existing_reflection_or_access_another_users_record(self):
        first_response = self.post({"worked_on": "APIを読んだ"})
        duplicate_response = self.post({"worked_on": "もう一件作る"})

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
        self.assertEqual(duplicate_response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(forbidden_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Reflection.objects.count(), 1)
