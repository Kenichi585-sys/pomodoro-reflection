from django.urls import path

from .views import (
    ReflectionView,
    StudyRecordCreateView,
    StudyRecordDeleteView,
    StudyRecordHistoryView,
    TodayStudySummaryView,
)


urlpatterns = [
    path("", StudyRecordCreateView.as_view(), name="study-record-create"),
    path("today-summary/", TodayStudySummaryView.as_view(), name="today-summary"),
    path("history/", StudyRecordHistoryView.as_view(), name="history"),
    path(
        "<int:study_record_id>/",
        StudyRecordDeleteView.as_view(),
        name="study-record-delete",
    ),
    path(
        "<int:study_record_id>/reflection/",
        ReflectionView.as_view(),
        name="reflection",
    ),
]
