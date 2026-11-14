import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudyHistoryResponse } from "../api/studyRecords";
import { StudyHistory } from "./StudyHistory";

const firstPage: StudyHistoryResponse = {
  total_study_seconds: 1500,
  groups: [
    {
      study_date: "2026-11-13",
      study_seconds: 1500,
      records: [
        {
          id: 1,
          study_date: "2026-11-13",
          started_at: "2026-11-13T10:00:00+09:00",
          ended_at: "2026-11-13T10:25:00+09:00",
          study_seconds: 1500,
          goal: "Serializerを説明できるようにする",
          reflection: {
            id: 1,
            worked_on: "Serializerを読んだ",
            learned: "検証済みデータを使う理由が分かった",
            impressions: "思っていたより役割が明確だった",
            next_action: "記事の下書きを作る",
            created_at: "2026-11-13T10:30:00+09:00",
            updated_at: "2026-11-13T10:30:00+09:00",
          },
        },
      ],
    },
  ],
  next_offset: 20,
};

describe("StudyHistory", () => {
  afterEach(cleanup);

  it("日付ごとの履歴を表示し、続きを追加で読み込む", async () => {
    const deleteStudyRecord = vi.fn().mockResolvedValue(undefined);
    const createReflection = vi.fn();
    const updateReflection = vi.fn();
    const onStudyRecordDeleted = vi.fn();
    const loadHistory = vi
      .fn<(offset?: number) => Promise<StudyHistoryResponse>>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        total_study_seconds: 2100,
        groups: [
          {
            study_date: "2026-11-12",
            study_seconds: 600,
            records: [
              {
                id: 2,
                study_date: "2026-11-12",
                started_at: "2026-11-12T09:00:00+09:00",
                ended_at: "2026-11-12T09:10:00+09:00",
                study_seconds: 600,
                goal: "",
                reflection: null,
              },
            ],
          },
        ],
        next_offset: 40,
      })
      .mockResolvedValueOnce({
        total_study_seconds: 1500,
        groups: [],
        next_offset: null,
      });

    render(
      <StudyHistory
        loadHistory={loadHistory}
        deleteStudyRecord={deleteStudyRecord}
        createReflection={createReflection}
        updateReflection={updateReflection}
        deleteReflection={vi.fn()}
        onStudyRecordDeleted={onStudyRecordDeleted}
        onBack={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Serializerを説明できるようにする"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("検証済みデータを使う理由が分かった"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("思っていたより役割が明確だった"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("25分")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "さらに読み込む" }));

    expect(await screen.findByText("振り返りなし")).toBeInTheDocument();
    expect(screen.getByText("35分")).toBeInTheDocument();
    expect(loadHistory).toHaveBeenNthCalledWith(1, 0);
    expect(loadHistory).toHaveBeenNthCalledWith(2, 20);

    fireEvent.click(
      screen.getAllByRole("button", { name: "この学習記録を削除" })[1],
    );
    expect(
      screen.getByText(
        "学習時間と振り返りの両方が削除されます。元に戻せません。",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(deleteStudyRecord).toHaveBeenCalledWith(2));
    expect(screen.queryByText("振り返りなし")).not.toBeInTheDocument();
    expect(screen.queryByText("35分")).not.toBeInTheDocument();
    expect(screen.getAllByText("25分")).toHaveLength(2);
    expect(onStudyRecordDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, study_seconds: 600 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "さらに読み込む" }));
    await waitFor(() => expect(loadHistory).toHaveBeenNthCalledWith(3, 39));
  });

  it("履歴から保存済みの振り返りを編集できる", async () => {
    const updatedReflection = {
      ...firstPage.groups[0].records[0].reflection!,
      learned: "編集後の内容",
    };
    const updateReflection = vi.fn().mockResolvedValue(updatedReflection);

    render(
      <StudyHistory
        loadHistory={async () => firstPage}
        deleteStudyRecord={vi.fn()}
        createReflection={vi.fn()}
        updateReflection={updateReflection}
        deleteReflection={vi.fn()}
        onStudyRecordDeleted={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "振り返りを編集" }),
    );
    expect(
      screen.getByRole("heading", { name: "振り返りを編集" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("分かったこと"), {
      target: { value: "編集後の内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateReflection).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ learned: "編集後の内容" }),
      ),
    );
    expect(await screen.findByText("編集後の内容")).toBeInTheDocument();
  });

  it("目標画面へ戻る操作を渡す", async () => {
    const onBack = vi.fn();
    render(
      <StudyHistory
        loadHistory={async () => ({
          total_study_seconds: 0,
          groups: [],
          next_offset: null,
        })}
        deleteStudyRecord={vi.fn()}
        createReflection={vi.fn()}
        updateReflection={vi.fn()}
        deleteReflection={vi.fn()}
        onStudyRecordDeleted={vi.fn()}
        onBack={onBack}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("保存された学習記録はまだありません。"))
        .toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "今回の目標へ戻る" }),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });
});
