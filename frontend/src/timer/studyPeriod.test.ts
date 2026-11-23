import { describe, expect, it } from "vitest";

import { formatStudyPeriod, formatStudyTimeRange } from "./studyPeriod";

describe("studyPeriod", () => {
  it("同じ日の学習時間帯を表示する", () => {
    expect(
      formatStudyPeriod(
        "2026-11-21T23:00:00+09:00",
        "2026-11-21T23:25:00+09:00",
      ),
    ).toBe("2026年11月21日 23:00〜23:25");
  });

  it("翌日に終了した学習は終了時刻へ翌を付ける", () => {
    expect(
      formatStudyPeriod(
        "2026-11-21T23:00:00+09:00",
        "2026-11-22T01:00:00+09:00",
      ),
    ).toBe("2026年11月21日 23:00〜翌1:00");
    expect(
      formatStudyTimeRange(
        "2026-11-21T23:00:00+09:00",
        "2026-11-22T01:00:00+09:00",
      ),
    ).toBe("23:00〜翌1:00");
  });
});
