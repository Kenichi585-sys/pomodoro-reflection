from django.contrib import admin

from .models import Reflection, ReflectionDeepDive, StudyRecord, StudyTheme


admin.site.register(StudyTheme)
admin.site.register(StudyRecord)
admin.site.register(Reflection)
admin.site.register(ReflectionDeepDive)
