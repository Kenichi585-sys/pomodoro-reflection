import { useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import type {
  AiUsageState,
  Reflection,
  ReflectionInput,
  ReflectionScore,
} from "../api/reflections";
import type { StudyRecord } from "../api/studyRecords";
import { formatStudyTime } from "../timer/timerConfig";

type ReflectionFormProps = {
  studyRecord: StudyRecord;
  initialReflection?: Reflection;
  onSubmit: (input: ReflectionInput) => Promise<Reflection>;
  onSaved: (reflection: Reflection) => void;
  onCancel: () => void;
};

type ScoreSelection = "" | `${ReflectionScore}`;
type AiCommunicationSelection = ScoreSelection | "unused";

const SCORE_OPTIONS: ReflectionScore[] = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
];

const toScoreSelection = (
  score: ReflectionScore | null | undefined,
): ScoreSelection => (score === null || score === undefined ? "" : `${score}`);

const toScore = (selection: ScoreSelection): ReflectionScore | null =>
  selection === "" ? null : (Number(selection) as ReflectionScore);

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

export const ReflectionForm = ({
  studyRecord,
  initialReflection,
  onSubmit,
  onSaved,
  onCancel,
}: ReflectionFormProps) => {
  const initialAiCommunicationSelection: AiCommunicationSelection =
    initialReflection?.ai_usage_state === "unused"
      ? "unused"
      : toScoreSelection(initialReflection?.ai_communication_score);
  const [workedOn, setWorkedOn] = useState(initialReflection?.worked_on ?? "");
  const [difficulty, setDifficulty] = useState(
    initialReflection?.difficulty ?? "",
  );
  const [attempted, setAttempted] = useState(
    initialReflection?.attempted ?? "",
  );
  const [understandingChange, setUnderstandingChange] = useState(
    initialReflection?.understanding_change ?? "",
  );
  const [nextAction, setNextAction] = useState(
    initialReflection?.next_action ?? "",
  );
  const [deepDives, setDeepDives] = useState<string[]>(
    initialReflection?.deep_dives.map(({ content }) => content) ?? [],
  );
  const [aiCommunication, setAiCommunication] =
    useState<AiCommunicationSelection>(initialAiCommunicationSelection);
  const [aiThinking, setAiThinking] = useState<ScoreSelection>(
    toScoreSelection(initialReflection?.ai_thinking_score),
  );
  const [outcomeScore, setOutcomeScore] = useState<ScoreSelection>(
    toScoreSelection(initialReflection?.outcome_score),
  );
  const [outcomeEvidence, setOutcomeEvidence] = useState(
    initialReflection?.outcome_evidence ?? "",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isOutcomeUncertain, setIsOutcomeUncertain] = useState(false);

  const clearDifficulty = () => {
    if (
      (attempted || understandingChange) &&
      !window.confirm("試したことと理解の変化も削除しますか？")
    ) {
      return;
    }
    setDifficulty("");
    setAttempted("");
    setUnderstandingChange("");
  };

  const clearAttempted = () => {
    if (
      understandingChange &&
      !window.confirm("理解の変化も削除しますか？")
    ) {
      return;
    }
    setAttempted("");
    setUnderstandingChange("");
  };

  const clearNextAction = () => {
    if (
      deepDives.some((content) => content.trim()) &&
      !window.confirm("追加した深掘りも削除しますか？")
    ) {
      return;
    }
    setNextAction("");
    setDeepDives([]);
  };

  const changeAiCommunication = (selection: AiCommunicationSelection) => {
    setAiCommunication(selection);
    if (selection === "unused") setAiThinking("");
  };

  const updateDeepDive = (index: number, content: string) => {
    setDeepDives((currentDeepDives) =>
      currentDeepDives.map((currentContent, currentIndex) =>
        currentIndex === index ? content : currentContent,
      ),
    );
  };

  const removeDeepDive = (index: number) => {
    setDeepDives((currentDeepDives) =>
      currentDeepDives.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setFieldErrors({});
    setFormError("");

    const aiCommunicationScore =
      aiCommunication === "" || aiCommunication === "unused"
        ? null
        : toScore(aiCommunication);
    const aiThinkingScore = toScore(aiThinking);
    const aiUsageState: AiUsageState =
      aiCommunication === "unused"
        ? "unused"
        : aiCommunicationScore !== null || aiThinkingScore !== null
          ? "used"
          : "unanswered";

    try {
      const reflection = await onSubmit({
        worked_on: workedOn,
        difficulty,
        attempted,
        understanding_change: understandingChange,
        next_action: nextAction,
        ai_usage_state: aiUsageState,
        ai_communication_score: aiCommunicationScore,
        ai_thinking_score: aiThinkingScore,
        outcome_score: toScore(outcomeScore),
        outcome_evidence: outcomeEvidence,
        deep_dives: deepDives
          .map((content) => content.trim())
          .filter(Boolean)
          .map((content) => ({ content })),
      });
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
      <p className="eyebrow">学習の振り返り</p>
      <h1 id="reflection-title">
        {initialReflection ? "振り返りを編集" : "振り返り"}
      </h1>
      <p className="reflection-study-summary">
        {formatStudyPeriod(studyRecord)}
        <span>学習時間 {formatStudyTime(studyRecord.study_seconds)}</span>
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset
          className="reflection-input-fields"
          disabled={isSaving || isOutcomeUncertain}
        >
        <label htmlFor="reflection-worked-on">今回取り組んだこと</label>
        <textarea
          id="reflection-worked-on"
          rows={4}
          value={workedOn}
          onChange={(event) => setWorkedOn(event.target.value)}
        />
        {fieldError("worked_on")}

        <label htmlFor="reflection-difficulty">引っかかったこと</label>
        <textarea
          id="reflection-difficulty"
          rows={4}
          value={difficulty}
          onChange={(event) => {
            if (event.target.value === "") clearDifficulty();
            else setDifficulty(event.target.value);
          }}
        />
        {fieldError("difficulty")}

        <label htmlFor="reflection-attempted">
          引っかかったことに対して試したこと
        </label>
        <textarea
          id="reflection-attempted"
          rows={4}
          value={attempted}
          disabled={!difficulty.trim()}
          onChange={(event) => {
            if (event.target.value === "") clearAttempted();
            else setAttempted(event.target.value);
          }}
        />
        {fieldError("attempted")}

        <label htmlFor="reflection-understanding-change">
          試した結果、理解はどう変わったか
        </label>
        <textarea
          id="reflection-understanding-change"
          rows={4}
          placeholder="理解が深まった点、まだ分からない点、理解が変わらなかった点など"
          value={understandingChange}
          disabled={!attempted.trim()}
          onChange={(event) => setUnderstandingChange(event.target.value)}
        />
        {fieldError("understanding_change")}

        <label htmlFor="reflection-next-action">次に行う具体的な行動</label>
        <textarea
          id="reflection-next-action"
          rows={4}
          value={nextAction}
          onChange={(event) => {
            if (event.target.value === "") clearNextAction();
            else setNextAction(event.target.value);
          }}
        />
        {fieldError("next_action")}

        <div className="deep-dive-list">
          {deepDives.map((content, index) => (
            <div className="deep-dive-field" key={index}>
              <label htmlFor={`reflection-deep-dive-${index}`}>
                行動の深掘り {index + 1}
              </label>
              <textarea
                id={`reflection-deep-dive-${index}`}
                rows={3}
                value={content}
                disabled={!nextAction.trim()}
                onChange={(event) => updateDeepDive(index, event.target.value)}
              />
              <button
                className="text-button"
                type="button"
                onClick={() => removeDeepDive(index)}
              >
                この深掘りを削除
              </button>
            </div>
          ))}
        </div>
        {fieldError("deep_dives")}
        <button
          className="secondary-button add-deep-dive-button"
          type="button"
          disabled={!nextAction.trim()}
          onClick={() => setDeepDives((current) => [...current, ""])}
        >
          さらに深掘り
        </button>

        <fieldset className="reflection-score-section">
          <legend>AIとの向き合い方と成果</legend>

          <label htmlFor="reflection-ai-communication">
            AIへの質問に、自分の考え・仮説・理由・試したことをどのくらい伝えたか
          </label>
          <select
            id="reflection-ai-communication"
            value={aiCommunication}
            onChange={(event) =>
              changeAiCommunication(
                event.target.value as AiCommunicationSelection,
              )
            }
          >
            <option value="">選択してください（任意）</option>
            {SCORE_OPTIONS.map((score) => (
              <option value={score} key={score}>
                {score} / 100
              </option>
            ))}
            <option value="unused">今回はAIを使用していない</option>
          </select>
          {fieldError("ai_communication_score")}

          <label htmlFor="reflection-ai-thinking">
            AIを使った今回の学習や業務で、比較・検討・判断を自分で行った実感はどのくらいあるか
          </label>
          <select
            id="reflection-ai-thinking"
            value={aiThinking}
            disabled={aiCommunication === "unused"}
            onChange={(event) =>
              setAiThinking(event.target.value as ScoreSelection)
            }
          >
            <option value="">選択してください（任意）</option>
            {SCORE_OPTIONS.map((score) => (
              <option value={score} key={score}>
                {score} / 100
              </option>
            ))}
          </select>
          {fieldError("ai_thinking_score")}

          <label htmlFor="reflection-outcome-score">
            現在取り組んでいる学習や業務は、成果や良い影響にどの程度つながっていると感じるか
          </label>
          <select
            id="reflection-outcome-score"
            value={outcomeScore}
            onChange={(event) =>
              setOutcomeScore(event.target.value as ScoreSelection)
            }
          >
            <option value="">選択してください（任意）</option>
            {SCORE_OPTIONS.map((score) => (
              <option value={score} key={score}>
                {score} / 100
              </option>
            ))}
          </select>
          {fieldError("outcome_score")}

          <label htmlFor="reflection-outcome-evidence">
            成果や良い影響についての具体的な出来事・変化（任意）
          </label>
          <textarea
            id="reflection-outcome-evidence"
            rows={4}
            placeholder="以前はできなかったが今はできるようになってきていること、実際に出た成果、周囲からの反応など"
            value={outcomeEvidence}
            onChange={(event) => setOutcomeEvidence(event.target.value)}
          />
          {fieldError("outcome_evidence")}
        </fieldset>
        </fieldset>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="reflection-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving
              ? "保存しています"
              : isOutcomeUncertain
                ? "同じ内容で保存結果を確認"
                : "保存"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={isSaving || isOutcomeUncertain}
            onClick={onCancel}
          >
            キャンセル
          </button>
        </div>
      </form>
    </section>
  );
};
