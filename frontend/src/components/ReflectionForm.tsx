import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import type { Reflection, ReflectionInput } from "../api/reflections";
import type { StudyRecord } from "../api/studyRecords";
import { formatStudyTime } from "../timer/timerConfig";

type ReflectionFormProps = {
  studyRecord: Pick<
    StudyRecord,
    "id" | "started_at" | "ended_at" | "study_seconds" | "goal"
  >;
  initialReflection?: Reflection;
  onSubmit: (input: ReflectionInput) => Promise<Reflection>;
  onSaved: (reflection: Reflection) => void;
  onDelete?: () => Promise<void>;
  onDeleted?: () => void;
  onSkip: () => void;
};

const formatStudyPeriod = (
  studyRecord: Pick<StudyRecord, "started_at" | "ended_at">,
): string => {
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

export const ReflectionForm = ({
  studyRecord,
  initialReflection,
  onSubmit,
  onSaved,
  onDelete,
  onDeleted,
  onSkip,
}: ReflectionFormProps) => {
  const [workedOn, setWorkedOn] = useState(initialReflection?.worked_on ?? "");
  const [learned, setLearned] = useState(initialReflection?.learned ?? "");
  const [impressions, setImpressions] = useState(
    initialReflection?.impressions ?? "",
  );
  const [nextAction, setNextAction] = useState(
    initialReflection?.next_action ?? "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isOutcomeUncertain, setIsOutcomeUncertain] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<
    "delete" | "discard" | null
  >(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmationAction === null) return;

    confirmationButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        setConfirmationAction(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmationAction, isSaving]);

  const input: ReflectionInput = {
    worked_on: workedOn.trim(),
    learned: learned.trim(),
    impressions: impressions.trim(),
    next_action: nextAction.trim(),
  };
  const hasInput = Object.values(input).some(Boolean);
  const hasChanges =
    workedOn !== (initialReflection?.worked_on ?? "") ||
    learned !== (initialReflection?.learned ?? "") ||
    impressions !== (initialReflection?.impressions ?? "") ||
    nextAction !== (initialReflection?.next_action ?? "");

  const handleSkip = () => {
    if (hasChanges) {
      setConfirmationAction("discard");
      return;
    }
    onSkip();
  };

  const deleteReflection = async () => {
    if (onDelete === undefined || onDeleted === undefined) {
      setFormError("振り返りを削除できませんでした。もう一度お試しください。");
      setConfirmationAction(null);
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setFormError("");
    try {
      await onDelete();
      onDeleted();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.isOutcomeUncertain) setIsOutcomeUncertain(true);
        setFormError(error.message);
      } else {
        setFormError("振り返りを削除できませんでした。もう一度お試しください。");
      }
    } finally {
      setIsSaving(false);
      setConfirmationAction(null);
    }
  };

  const confirmAction = () => {
    if (confirmationAction === "discard") {
      setConfirmationAction(null);
      onSkip();
      return;
    }
    if (confirmationAction === "delete") void deleteReflection();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasInput) {
      if (initialReflection === undefined) {
        onSkip();
        return;
      }
      setConfirmationAction("delete");
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setFormError("");

    try {
      const reflection = await onSubmit(input);
      onSaved(reflection);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.isOutcomeUncertain) setIsOutcomeUncertain(true);
        setFieldErrors(error.fieldErrors);
        setFormError(
          error.fieldErrors.non_field_errors?.[0] ?? error.message,
        );
      } else {
        setFormError("振り返りを保存できませんでした。もう一度お試しください。");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const fieldError = (fieldName: string) =>
    fieldErrors[fieldName]?.map((message) => (
      <p className="field-error" key={message}>
        {message}
      </p>
    ));

  return (
    <section className="reflection-card" aria-labelledby="reflection-title">
      <h1 id="reflection-title">
        {initialReflection ? "振り返りを編集" : "振り返り"}
      </h1>
      <p className="reflection-study-summary">
        {formatStudyPeriod(studyRecord)}
        <span>学習時間 {formatStudyTime(studyRecord.study_seconds)}</span>
      </p>

      {studyRecord.goal && (
        <section
          className="reflection-goal"
          aria-labelledby="reflection-goal-title"
        >
          <h2 id="reflection-goal-title">今回の目標</h2>
          <p>{studyRecord.goal}</p>
        </section>
      )}

      <form onSubmit={handleSubmit}>
        <fieldset
          className="reflection-input-fields"
          disabled={
            isSaving || isOutcomeUncertain || confirmationAction !== null
          }
        >
          <label htmlFor="reflection-worked-on">今回取り組んだこと</label>
          <textarea
            id="reflection-worked-on"
            rows={4}
            value={workedOn}
            onChange={(event) => setWorkedOn(event.target.value)}
          />
          {fieldError("worked_on")}

          <label htmlFor="reflection-learned">分かったこと</label>
          <textarea
            id="reflection-learned"
            rows={4}
            value={learned}
            onChange={(event) => setLearned(event.target.value)}
          />
          {fieldError("learned")}

          <label htmlFor="reflection-impressions">
            学習を通して感じたこと
          </label>
          <p id="reflection-impressions-help" className="reflection-help-text">
            学習前後で変わった印象や、難しかった・意外だったと感じたことなど
          </p>
          <textarea
            id="reflection-impressions"
            aria-describedby="reflection-impressions-help"
            rows={4}
            value={impressions}
            onChange={(event) => setImpressions(event.target.value)}
          />
          {fieldError("impressions")}

          <label htmlFor="reflection-next-action">次にやること</label>
          <textarea
            id="reflection-next-action"
            rows={4}
            value={nextAction}
            onChange={(event) => setNextAction(event.target.value)}
          />
          {fieldError("next_action")}
        </fieldset>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="reflection-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={isSaving || confirmationAction !== null}
          >
            {isSaving
              ? "保存しています"
              : isOutcomeUncertain
                ? initialReflection && !hasInput
                  ? "削除結果を確認"
                  : "同じ内容で保存結果を確認"
                : "保存"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={
              isSaving || isOutcomeUncertain || confirmationAction !== null
            }
            onClick={handleSkip}
          >
            {initialReflection ? "編集をキャンセル" : "振り返りを書かず終了"}
          </button>
        </div>
      </form>

      {confirmationAction !== null && (
        <div className="confirmation-modal-backdrop">
          <section
            className="confirmation-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reflection-confirmation-title"
            aria-describedby="reflection-confirmation-description"
          >
            <h2 id="reflection-confirmation-title">
              {confirmationAction === "delete"
                ? "振り返りなしに戻しますか？"
                : "変更内容を破棄しますか？"}
            </h2>
            <p id="reflection-confirmation-description">
              {confirmationAction === "delete"
                ? "入力済みの振り返りは削除され、元に戻せません。学習時間と今回の目標は残ります。"
                : initialReflection
                  ? "保存していない変更内容は失われます。"
                  : "入力中の振り返りは失われます。学習時間はすでに保存されています。"}
            </p>
            <div className="confirmation-modal-actions">
              <button
                ref={confirmationButtonRef}
                className="primary-button"
                type="button"
                disabled={isSaving}
                onClick={confirmAction}
              >
                {isSaving
                  ? "処理しています"
                  : confirmationAction === "delete"
                    ? "振り返りなしに戻す"
                    : "破棄する"}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={isSaving}
                onClick={() => setConfirmationAction(null)}
              >
                やめる
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};
