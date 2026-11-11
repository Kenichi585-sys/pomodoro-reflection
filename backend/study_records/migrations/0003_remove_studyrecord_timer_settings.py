from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("study_records", "0002_remove_studyrecord_completed_focus_count"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="studyrecord",
            name="preset",
        ),
        migrations.RemoveField(
            model_name="studyrecord",
            name="focus_seconds",
        ),
        migrations.RemoveField(
            model_name="studyrecord",
            name="break_seconds",
        ),
    ]
