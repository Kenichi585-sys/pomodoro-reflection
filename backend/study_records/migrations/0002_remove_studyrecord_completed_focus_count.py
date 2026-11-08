from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("study_records", "0001_initial"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="studyrecord",
            name="completed_focus_count",
        ),
    ]
