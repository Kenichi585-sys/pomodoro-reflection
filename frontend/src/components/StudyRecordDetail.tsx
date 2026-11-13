import type { Reflection } from "../api/reflections";
import type { StudyRecord } from "../api/studyRecords";
import { formatStudyTime } from "../timer/timerConfig";

type StudyRecordDetailProps = {
  studyRecord: StudyRecord;
  reflection: Reflection;
  onEditReflection: () => void;
  onStartNewStudy: () => void;
};

type DetailFieldProps = {
  label: string;
  value: string;
};

const formatStudyPeriod = (studyRecord: StudyRecord): string => {
  const startedAt = new Date(studyRecord.started_at);
  const endedAt = new Date(studyRecord.ended_at);
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(startedAt);
  const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${timeFormatter.format(startedAt)}〜${timeFormatter.format(endedAt)}`;
};

const DetailField = ({ label, value }: DetailFieldProps) =>
  value ? (
    <section className="reflection-detail-field">
      <h2>{label}</h2>
      <p>{value}</p>
    </section>
  ) : null;

export const StudyRecordDetail = ({
  studyRecord,
  reflection,
  onEditReflection,
  onStartNewStudy,
}: StudyRecordDetailProps) => (
  <section className="study-record-detail" aria-labelledby="reflection-detail-title">
    <p className="eyebrow">振り返り完了</p>
    <h1 id="reflection-detail-title">振り返りを保存しました</h1>
    <p className="reflection-study-summary">
      {formatStudyPeriod(studyRecord)}
      <span>学習時間 {formatStudyTime(studyRecord.study_seconds)}</span>
    </p>

    <div className="reflection-detail-content">
      <DetailField label="今回の目標" value={studyRecord.goal} />
      <DetailField label="今回取り組んだこと" value={reflection.worked_on} />
      <DetailField label="分かったこと" value={reflection.learned} />
      <DetailField label="次にやること" value={reflection.next_action} />
    </div>

    <div className="reflection-actions">
      <button
        className="secondary-button"
        type="button"
        onClick={onEditReflection}
      >
        振り返りを編集
      </button>
      <button
        className="primary-button"
        type="button"
        onClick={onStartNewStudy}
      >
        新しい学習を始める
      </button>
    </div>
  </section>
);
