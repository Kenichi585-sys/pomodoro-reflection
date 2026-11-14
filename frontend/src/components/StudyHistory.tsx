import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client";
import type { Reflection, ReflectionInput } from "../api/reflections";
import type {
  StudyHistoryGroup,
  StudyHistoryRecord,
  StudyHistoryResponse,
} from "../api/studyRecords";
import { formatStudyTime } from "../timer/timerConfig";
import { ReflectionForm } from "./ReflectionForm";

type StudyHistoryProps = {
  loadHistory: (offset?: number) => Promise<StudyHistoryResponse>;
  deleteStudyRecord: (studyRecordId: number) => Promise<void>;
  createReflection: (
    studyRecordId: number,
    input: ReflectionInput,
  ) => Promise<Reflection>;
  updateReflection: (
    studyRecordId: number,
    input: ReflectionInput,
  ) => Promise<Reflection>;
  deleteReflection: (studyRecordId: number) => Promise<void>;
  onStudyRecordDeleted: (studyRecord: StudyHistoryRecord) => void;
  onBack: () => void;
};

const formatDate = (studyDate: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${studyDate}T00:00:00`));

const formatTime = (dateTime: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateTime));

export const StudyHistory = ({
  loadHistory,
  deleteStudyRecord,
  createReflection,
  updateReflection,
  deleteReflection,
  onStudyRecordDeleted,
  onBack,
}: StudyHistoryProps) => {
  const [groups, setGroups] = useState<StudyHistoryGroup[]>([]);
  const [totalStudySeconds, setTotalStudySeconds] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [recordPendingDeletion, setRecordPendingDeletion] =
    useState<StudyHistoryRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recordBeingReflected, setRecordBeingReflected] =
    useState<StudyHistoryRecord | null>(null);

  const confirmDeletion = async () => {
    if (recordPendingDeletion === null) return;

    setIsDeleting(true);
    setErrorMessage("");
    try {
      await deleteStudyRecord(recordPendingDeletion.id);
      const didRemoveStudyDate = groups.some(
        (group) =>
          group.study_date === recordPendingDeletion.study_date &&
          group.records.length === 1,
      );
      setGroups((currentGroups) =>
        currentGroups
          .map((group) => ({
            ...group,
            study_seconds:
              group.study_date === recordPendingDeletion.study_date
                ? group.study_seconds - recordPendingDeletion.study_seconds
                : group.study_seconds,
            records: group.records.filter(
              (record) => record.id !== recordPendingDeletion.id,
            ),
          }))
          .filter((group) => group.records.length > 0),
      );
      setTotalStudySeconds((currentSeconds) =>
        Math.max(0, currentSeconds - recordPendingDeletion.study_seconds),
      );
      if (didRemoveStudyDate) {
        setNextOffset((currentOffset) =>
          currentOffset === null ? null : Math.max(0, currentOffset - 1),
        );
      }
      onStudyRecordDeleted(recordPendingDeletion);
      setRecordPendingDeletion(null);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "学習記録を削除できませんでした。",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const loadPage = useCallback(async (offset: number) => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await loadHistory(offset);
      setGroups((currentGroups) =>
        offset === 0
          ? response.groups
          : [...currentGroups, ...response.groups],
      );
      setNextOffset(response.next_offset);
      setTotalStudySeconds(response.total_study_seconds);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "過去の振り返りを取得できませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
  }, [loadHistory]);

  const finishReflection = (reflection: Reflection) => {
    if (recordBeingReflected === null) return;

    setGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        records: group.records.map((record) =>
          record.id === recordBeingReflected.id
            ? { ...record, reflection }
            : record,
        ),
      })),
    );
    setRecordBeingReflected(null);
  };

  const finishReflectionDeletion = () => {
    if (recordBeingReflected === null) return;

    setGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        records: group.records.map((record) =>
          record.id === recordBeingReflected.id
            ? { ...record, reflection: null }
            : record,
        ),
      })),
    );
    setRecordBeingReflected(null);
  };

  useEffect(() => {
    let isActive = true;

    void loadHistory(0)
      .then((response) => {
        if (!isActive) return;
        setGroups(response.groups);
        setNextOffset(response.next_offset);
        setTotalStudySeconds(response.total_study_seconds);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "過去の振り返りを取得できませんでした。",
        );
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [loadHistory]);

  if (recordBeingReflected !== null) {
    return (
      <ReflectionForm
        key={recordBeingReflected.id}
        studyRecord={recordBeingReflected}
        initialReflection={recordBeingReflected.reflection ?? undefined}
        onSubmit={(input) =>
          recordBeingReflected.reflection === null
            ? createReflection(recordBeingReflected.id, input)
            : updateReflection(recordBeingReflected.id, input)
        }
        onSaved={finishReflection}
        onDelete={() => deleteReflection(recordBeingReflected.id)}
        onDeleted={finishReflectionDeletion}
        onSkip={() => setRecordBeingReflected(null)}
      />
    );
  }

  return (
    <section className="study-history" aria-labelledby="study-history-title">
      <header className="study-history-heading">
        <h1 id="study-history-title">過去の振り返り</h1>
        <p>
          <span>総学習時間</span>
          <strong>{formatStudyTime(totalStudySeconds)}</strong>
        </p>
      </header>

      {errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
      {!isLoading && groups.length === 0 && !errorMessage && (
        <p>保存された学習記録はまだありません。</p>
      )}

      <div className="study-history-groups">
        {groups.map((group) => (
          <section className="study-history-group" key={group.study_date}>
            <header className="study-history-date-header">
              <h2>{formatDate(group.study_date)}</h2>
              <p>合計 {formatStudyTime(group.study_seconds)}</p>
            </header>
            <div className="study-history-records">
              {group.records.map((record) => (
                <article className="study-history-record" key={record.id}>
                  <p className="study-history-period">
                    {formatTime(record.started_at)}〜{formatTime(record.ended_at)}
                    <span>{formatStudyTime(record.study_seconds)}</span>
                  </p>
                  {record.goal && (
                    <div>
                      <h3>今回の目標</h3>
                      <p>{record.goal}</p>
                    </div>
                  )}
                  {record.reflection === null ? (
                    <p className="study-history-empty">振り返りなし</p>
                  ) : (
                    <>
                      {record.reflection.worked_on && (
                        <div>
                          <h3>今回取り組んだこと</h3>
                          <p>{record.reflection.worked_on}</p>
                        </div>
                      )}
                      {record.reflection.learned && (
                        <div>
                          <h3>分かったこと</h3>
                          <p>{record.reflection.learned}</p>
                        </div>
                      )}
                      {record.reflection.impressions && (
                        <div>
                          <h3>学習を通して感じたこと</h3>
                          <p>{record.reflection.impressions}</p>
                        </div>
                      )}
                      {record.reflection.next_action && (
                        <div>
                          <h3>次にやること</h3>
                          <p>{record.reflection.next_action}</p>
                        </div>
                      )}
                    </>
                  )}
                  <div className="study-history-record-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setRecordBeingReflected(record)}
                    >
                      {record.reflection === null
                        ? "振り返りを書く"
                        : "振り返りを編集"}
                    </button>
                    <button
                      className="text-button study-history-delete-button"
                      type="button"
                      onClick={() => setRecordPendingDeletion(record)}
                    >
                      この学習記録を削除
                    </button>
                  </div>
                  {recordPendingDeletion?.id === record.id && (
                    <div
                      className="study-history-delete-confirmation"
                      role="alertdialog"
                      aria-labelledby={`delete-record-title-${record.id}`}
                      aria-describedby={`delete-record-description-${record.id}`}
                    >
                      <h3 id={`delete-record-title-${record.id}`}>
                        この学習記録を削除しますか？
                      </h3>
                      <p id={`delete-record-description-${record.id}`}>
                        学習時間と振り返りの両方が削除されます。元に戻せません。
                      </p>
                      <div>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={isDeleting}
                          onClick={() => void confirmDeletion()}
                        >
                          {isDeleting ? "削除しています" : "削除する"}
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setRecordPendingDeletion(null)}
                        >
                          やめる
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {isLoading && <p role="status">読み込んでいます</p>}
      <div className="study-history-actions">
        {nextOffset !== null && !isLoading && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadPage(nextOffset)}
          >
            さらに読み込む
          </button>
        )}
        <button className="text-button" type="button" onClick={onBack}>
          今回の目標へ戻る
        </button>
      </div>
    </section>
  );
};
