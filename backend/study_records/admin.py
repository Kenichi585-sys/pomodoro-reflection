from django.contrib import admin

from .models import StudyRecord, StudyTheme


admin.site.register(StudyTheme)
admin.site.register(StudyRecord)
