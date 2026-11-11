from django.urls import path

from .views import ReflectionView, StudyRecordCreateView


urlpatterns = [
    path("", StudyRecordCreateView.as_view(), name="study-record-create"),
    path(
        "<int:study_record_id>/reflection/",
        ReflectionView.as_view(),
        name="reflection",
    ),
]
