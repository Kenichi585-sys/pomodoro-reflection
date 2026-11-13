import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudyRecord,
  deleteStudyRecord,
  getStudyHistory,
  getTodayStudySeconds,
  type CreateStudyRecordInput,
} from "./studyRecords";

const input: CreateStudyRecordInput = {
  client_uuid: "00000000-0000-4000-8000-000000000001",
  started_at: "2026-10-27T00:00:00.000Z",
  ended_at: "2026-10-27T00:00:02.000Z",
  study_seconds: 2,
  goal: "APIを確認する",
};

const jsonResponse = (body: object, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe("createStudyRecord", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("CSRF取得前の通信失敗は保存結果不明にしない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(createStudyRecord(input)).rejects.toMatchObject({
      isOutcomeUncertain: false,
    });
  });

  it("保存POST後のサーバーエラーは保存結果不明として扱う", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
        .mockResolvedValueOnce(jsonResponse({ detail: "server error" }, 500)),
    );

    await expect(createStudyRecord(input)).rejects.toMatchObject({
      isOutcomeUncertain: true,
    });
  });

  it("今日の保存済み学習秒数を取得する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ study_seconds: 3600 })),
    );

    await expect(getTodayStudySeconds()).resolves.toBe(3600);
  });

  it("指定した日付位置から過去の振り返りを取得する", async () => {
    const history = {
      total_study_seconds: 3600,
      groups: [],
      next_offset: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(history));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getStudyHistory(20)).resolves.toEqual(history);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/study-records/history/?offset=20",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("CSRFトークンを付けて学習記録を削除する", async () => {
    const noContentResponse = {
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new SyntaxError("no content")),
    } as unknown as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
      .mockResolvedValueOnce(noContentResponse);
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteStudyRecord(12)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/study-records/12/");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "DELETE",
      headers: { "X-CSRFToken": "csrf-token" },
    });
  });
});
