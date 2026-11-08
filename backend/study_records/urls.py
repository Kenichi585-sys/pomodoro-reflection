from django.urls import path

from .views import StudyRecordCreateView


urlpatterns = [
    path("", StudyRecordCreateView.as_view(), name="study-record-create"),
]
