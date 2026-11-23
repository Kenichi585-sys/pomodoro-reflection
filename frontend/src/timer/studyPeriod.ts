const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
});

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

export const formatStudyTimeRange = (
  startedAtValue: string,
  endedAtValue: string,
): string => {
  const startedAt = new Date(startedAtValue);
  const endedAt = new Date(endedAtValue);
  const startedTime = timeFormatter.format(startedAt);
  const endedTime = timeFormatter.format(endedAt);

  if (isSameLocalDate(startedAt, endedAt)) {
    return `${startedTime}〜${endedTime}`;
  }

  const nextDay = new Date(startedAt);
  nextDay.setHours(0, 0, 0, 0);
  nextDay.setDate(nextDay.getDate() + 1);
  if (isSameLocalDate(nextDay, endedAt)) {
    return `${startedTime}〜翌${endedTime.replace(/^0/, "")}`;
  }

  return `${startedTime}〜${dateFormatter.format(endedAt)} ${endedTime}`;
};

export const formatStudyPeriod = (
  startedAtValue: string,
  endedAtValue: string,
): string => {
  const startedAt = new Date(startedAtValue);
  return `${dateFormatter.format(startedAt)} ${formatStudyTimeRange(
    startedAtValue,
    endedAtValue,
  )}`;
};
