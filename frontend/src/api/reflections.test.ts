import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReflection,
  deleteReflection,
  updateReflection,
} from "./reflections";

const jsonResponse = (body: object, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe("reflection API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("同じURLへ作成はPOST、編集はPATCHで送信する", async () => {
    const reflection = {
      id: 1,
      worked_on: "Serializerを読んだ",
      learned: "検証後の値を使う",
      impressions: "理解前より単純に感じた",
      next_action: "",
      created_at: "2026-11-11T00:00:00Z",
      updated_at: "2026-11-11T00:00:00Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse(reflection, 201))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse(reflection))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: vi.fn().mockRejectedValue(new SyntaxError("no content")),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await createReflection(12, { worked_on: "Serializerを読んだ" });
    await updateReflection(12, { learned: "検証後の値を使う" });
    await deleteReflection(12);

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/study-records/12/reflection/",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "PATCH" });
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
