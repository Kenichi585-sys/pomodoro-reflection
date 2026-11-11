import { afterEach, describe, expect, it, vi } from "vitest";

import { createReflection, updateReflection } from "./reflections";

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
      difficulty: "",
      attempted: "",
      understanding_change: "",
      next_action: "",
      ai_usage_state: "unanswered",
      ai_communication_score: null,
      ai_thinking_score: null,
      outcome_score: null,
      outcome_evidence: "",
      deep_dives: [],
      created_at: "2026-11-11T00:00:00Z",
      updated_at: "2026-11-11T00:00:00Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse(reflection, 201))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: "csrf-token" }))
      .mockResolvedValueOnce(jsonResponse(reflection));
    vi.stubGlobal("fetch", fetchMock);

    await createReflection(12, { worked_on: "Serializerを読んだ" });
    await updateReflection(12, { outcome_score: 50 });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/study-records/12/reflection/",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "PATCH" });
  });
});
