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

const formatScore = (score: number | null): string =>
  score === null ? "未回答" : `${score} / 100`;

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
      <DetailField label="今回取り組んだこと" value={reflection.worked_on} />
      <DetailField label="引っかかったこと" value={reflection.difficulty} />
      <DetailField
        label="引っかかったことに対して試したこと"
        value={reflection.attempted}
      />
      <DetailField
        label="試した結果、理解はどう変わったか"
        value={reflection.understanding_change}
      />
      <DetailField label="次にやること" value={reflection.next_action} />

      {reflection.deep_dives.length > 0 && (
        <section className="reflection-detail-field">
          <h2>次にやることの深掘り</h2>
          <ol className="reflection-detail-deep-dives">
            {[...reflection.deep_dives]
              .sort(
                (first, second) =>
                  first.display_order - second.display_order,
              )
              .map((deepDive) => (
                <li key={deepDive.id}>{deepDive.content}</li>
              ))}
          </ol>
        </section>
      )}

      <section className="reflection-detail-field">
        <h2>AI活用の自己評価</h2>
        {reflection.ai_usage_state === "unused" ? (
          <p>今回はAIを使用していない</p>
        ) : (
          <dl className="reflection-score-list">
            <div>
              <dt>考え・仮説・理由・試したことをAIへ伝えた度合い</dt>
              <dd>{formatScore(reflection.ai_communication_score)}</dd>
            </div>
            <div>
              <dt>AIを使いながら自分で比較・検討・判断した実感</dt>
              <dd>{formatScore(reflection.ai_thinking_score)}</dd>
            </div>
          </dl>
        )}
        <dl className="reflection-score-list">
          <div>
            <dt>学習や業務が成果や良い影響につながっている実感</dt>
            <dd>{formatScore(reflection.outcome_score)}</dd>
          </div>
        </dl>
        {reflection.outcome_evidence && (
          <p className="reflection-outcome-evidence">
            {reflection.outcome_evidence}
          </p>
        )}
      </section>
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
