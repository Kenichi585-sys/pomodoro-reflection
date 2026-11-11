import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Reflection, ReflectionInput } from "../api/reflections";
import type { StudyRecord } from "../api/studyRecords";
import { ReflectionForm } from "./ReflectionForm";

const studyRecord: StudyRecord = {
  id: 12,
  client_uuid: "00000000-0000-4000-8000-000000000001",
  study_date: "2026-11-11",
  started_at: "2026-11-11T09:00:00+09:00",
  ended_at: "2026-11-11T09:25:00+09:00",
  study_seconds: 25 * 60,
  created_at: "2026-11-11T09:25:00+09:00",
  updated_at: "2026-11-11T09:25:00+09:00",
};

const reflectionResponse = (input: ReflectionInput): Reflection => ({
  id: 1,
  worked_on: input.worked_on ?? "",
  difficulty: input.difficulty ?? "",
  attempted: input.attempted ?? "",
  understanding_change: input.understanding_change ?? "",
  next_action: input.next_action ?? "",
  ai_usage_state: input.ai_usage_state ?? "unanswered",
  ai_communication_score: input.ai_communication_score ?? null,
  ai_thinking_score: input.ai_thinking_score ?? null,
  outcome_score: input.outcome_score ?? null,
  outcome_evidence: input.outcome_evidence ?? "",
  deep_dives: (input.deep_dives ?? []).map((deepDive, index) => ({
    id: index + 1,
    content: deepDive.content,
    display_order: index,
  })),
  created_at: "2026-11-11T09:26:00+09:00",
  updated_at: "2026-11-11T09:26:00+09:00",
});

const renderForm = () => {
  const onSubmit = vi.fn(async (input: ReflectionInput) =>
    reflectionResponse(input),
  );
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReflectionForm
      studyRecord={studyRecord}
      onSubmit={onSubmit}
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onSaved, onCancel };
};

describe("ReflectionForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("前提となる回答に合わせて後続欄を操作可能にする", () => {
    renderForm();

    const attempted = screen.getByLabelText(
      "引っかかったことに対して試したこと",
    );
    const understanding = screen.getByLabelText(
      "試した結果、理解はどう変わったか",
    );
    expect(attempted).toBeDisabled();
    expect(understanding).toBeDisabled();

    fireEvent.change(screen.getByLabelText("引っかかったこと"), {
      target: { value: "型の流れが分からなかった" },
    });
    expect(attempted).toBeEnabled();
    fireEvent.change(attempted, {
      target: { value: "値の受け渡しを図にした" },
    });
    expect(understanding).toBeEnabled();
  });

  it("AI未使用を選ぶと自分で考えた実感を未選択へ戻して無効化する", () => {
    renderForm();

    const thinking = screen.getByLabelText(
      "AIを使った今回の学習や業務で、比較・検討・判断を自分で行った実感はどのくらいあるか",
    );
    fireEvent.change(thinking, { target: { value: "70" } });
    fireEvent.change(
      screen.getByLabelText(
        "AIへの質問に、自分の考え・仮説・理由・試したことをどのくらい伝えたか",
      ),
      { target: { value: "unused" } },
    );

    expect(thinking).toBeDisabled();
    expect(thinking).toHaveValue("");
  });

  it("入力内容と深掘りをAPI用の値へ変換して保存する", async () => {
    const { onSubmit, onSaved } = renderForm();

    fireEvent.change(screen.getByLabelText("今回取り組んだこと"), {
      target: { value: "Serializerを読んだ" },
    });
    fireEvent.change(screen.getByLabelText("次に行う具体的な行動"), {
      target: { value: "短い記事を書く" },
    });
    fireEvent.click(screen.getByRole("button", { name: "さらに深掘り" }));
    fireEvent.change(screen.getByLabelText("行動の深掘り 1"), {
      target: { value: "コード例を一つ選ぶ" },
    });
    fireEvent.change(
      screen.getByLabelText(
        "AIへの質問に、自分の考え・仮説・理由・試したことをどのくらい伝えたか",
      ),
      { target: { value: "70" } },
    );
    fireEvent.change(
      screen.getByLabelText(
        "現在取り組んでいる学習や業務は、成果や良い影響にどの程度つながっていると感じるか",
      ),
      { target: { value: "50" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        worked_on: "Serializerを読んだ",
        next_action: "短い記事を書く",
        ai_usage_state: "used",
        ai_communication_score: 70,
        outcome_score: 50,
        deep_dives: [{ content: "コード例を一つ選ぶ" }],
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
