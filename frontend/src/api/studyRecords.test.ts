import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudyRecord,
  type CreateStudyRecordInput,
} from "./studyRecords";

const input: CreateStudyRecordInput = {
  client_uuid: "00000000-0000-4000-8000-000000000001",
  started_at: "2026-10-27T00:00:00.000Z",
  ended_at: "2026-10-27T00:00:02.000Z",
  study_seconds: 2,
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
});
