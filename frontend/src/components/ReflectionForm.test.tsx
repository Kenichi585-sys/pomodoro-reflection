import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../api/client";
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
  goal: "Serializerの流れを説明できるようにする",
  created_at: "2026-11-11T09:25:00+09:00",
  updated_at: "2026-11-11T09:25:00+09:00",
};

const reflectionResponse = (input: ReflectionInput): Reflection => ({
  id: 1,
  worked_on: input.worked_on ?? "",
  learned: input.learned ?? "",
  impressions: input.impressions ?? "",
  next_action: input.next_action ?? "",
  created_at: "2026-11-11T09:26:00+09:00",
  updated_at: "2026-11-11T09:26:00+09:00",
});

describe("ReflectionForm", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("今回の目標を確認し、4項目を保存する", async () => {
    const onSubmit = vi.fn(async (input: ReflectionInput) =>
      reflectionResponse(input),
    );
    const onSaved = vi.fn();
    render(
      <ReflectionForm
        studyRecord={studyRecord}
        onSubmit={onSubmit}
        onSaved={onSaved}
        onSkip={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Serializerの流れを説明できるようにする"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("今回取り組んだこと"), {
      target: { value: " Serializerを読んだ " },
    });
    fireEvent.change(screen.getByLabelText("分かったこと"), {
      target: { value: "検証後のデータを使う" },
    });
    expect(
      screen.getByText(
        "学習前後で変わった印象や、難しかった・意外だったと感じたことなど",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("学習を通して感じたこと"), {
      target: { value: "思っていたより流れは単純だった" },
    });
    fireEvent.change(screen.getByLabelText("次にやること"), {
      target: { value: "短い記事を書く" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith({
      worked_on: "Serializerを読んだ",
      learned: "検証後のデータを使う",
      impressions: "思っていたより流れは単純だった",
      next_action: "短い記事を書く",
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("未入力で保存すると振り返りを作らず終了する", () => {
    const onSubmit = vi.fn();
    const onSkip = vi.fn();
    render(
      <ReflectionForm
        studyRecord={studyRecord}
        onSubmit={onSubmit}
        onSaved={vi.fn()}
        onSkip={onSkip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("編集中の内容をすべて消すと振り返りなしへ戻す", async () => {
    const initialReflection = reflectionResponse({ worked_on: "仮の内容" });
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(
      <ReflectionForm
        studyRecord={studyRecord}
        initialReflection={initialReflection}
        onSubmit={vi.fn()}
        onSaved={vi.fn()}
        onDelete={onDelete}
        onDeleted={onDeleted}
        onSkip={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("今回取り組んだこと"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      screen.getByRole("alertdialog", { name: "振り返りなしに戻しますか？" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "振り返りなしに戻す" }),
    );

    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("保存結果が不明な場合は入力を固定して同じ内容だけ再送する", async () => {
    const savedReflection = reflectionResponse({ worked_on: "APIの保存経路" });
    const onSubmit = vi
      .fn<(input: ReflectionInput) => Promise<Reflection>>()
      .mockRejectedValueOnce(
        new ApiError("保存結果を確認できませんでした。", {}, true),
      )
      .mockResolvedValueOnce(savedReflection);
    const onSaved = vi.fn();
    render(
      <ReflectionForm
        studyRecord={studyRecord}
        onSubmit={onSubmit}
        onSaved={onSaved}
        onSkip={vi.fn()}
      />,
    );

    const workedOn = screen.getByLabelText("今回取り組んだこと");
    fireEvent.change(workedOn, { target: { value: "APIの保存経路" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "保存結果を確認できませんでした。",
    );
    expect(workedOn).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "振り返りを書かず終了" }),
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "同じ内容で保存結果を確認" }),
    );

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);
    expect(onSaved).toHaveBeenCalledWith(savedReflection);
  });
});
