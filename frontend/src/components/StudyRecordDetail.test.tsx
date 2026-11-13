import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Reflection } from "../api/reflections";
import type { StudyRecord } from "../api/studyRecords";
import { StudyRecordDetail } from "./StudyRecordDetail";

const studyRecord: StudyRecord = {
  id: 12,
  client_uuid: "c9fa12bb-2276-42f9-9b1c-b5ae3532ee56",
  started_at: "2026-11-11T10:00:00+09:00",
  ended_at: "2026-11-11T10:25:00+09:00",
  study_seconds: 1500,
  goal: "Serializerの保存経路を理解する",
  study_date: "2026-11-11",
  created_at: "2026-11-11T10:25:00+09:00",
  updated_at: "2026-11-11T10:25:00+09:00",
};

const reflection: Reflection = {
  id: 8,
  worked_on: "Serializerの保存経路",
  learned: "検証後のデータだと分かった",
  next_action: "PATCH更新を確認する",
  created_at: "2026-11-11T10:30:00+09:00",
  updated_at: "2026-11-11T10:30:00+09:00",
};

describe("StudyRecordDetail", () => {
  it("保存した振り返りを表示し、編集操作を渡す", () => {
    const onEditReflection = vi.fn();

    render(
      <StudyRecordDetail
        studyRecord={studyRecord}
        reflection={reflection}
        onEditReflection={onEditReflection}
        onStartNewStudy={vi.fn()}
      />,
    );

    expect(screen.getByText("Serializerの保存経路を理解する")).toBeInTheDocument();
    expect(screen.getByText("Serializerの保存経路")).toBeInTheDocument();
    expect(screen.getByText("検証後のデータだと分かった")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "振り返りを編集" }));
    expect(onEditReflection).toHaveBeenCalledOnce();
  });
});
