import { deleteWithCsrf, postJsonWithCsrf, requestJson } from "./client";
import type { Reflection } from "./reflections";

export type CreateStudyRecordInput = {
  client_uuid: string;
  started_at: string;
  ended_at: string;
  study_seconds: number;
  goal: string;
};

export type StudyRecord = CreateStudyRecordInput & {
  id: number;
  study_date: string;
  created_at: string;
  updated_at: string;
};

export type CreateStudyRecordOptions = {
  onRequestStarted?: () => void;
};

export type StudyHistoryRecord = Pick<
  StudyRecord,
  "id" | "study_date" | "started_at" | "ended_at" | "study_seconds" | "goal"
> & {
  reflection: Reflection | null;
};

export type StudyHistoryGroup = {
  study_date: string;
  study_seconds: number;
  records: StudyHistoryRecord[];
};

export type StudyHistoryResponse = {
  total_study_seconds: number;
  groups: StudyHistoryGroup[];
  next_offset: number | null;
};

export const createStudyRecord = (
  input: CreateStudyRecordInput,
  options?: CreateStudyRecordOptions,
): Promise<StudyRecord> =>
  postJsonWithCsrf<StudyRecord>(
    "/api/study-records/",
    input,
    true,
    options?.onRequestStarted,
  );

export const getTodayStudySeconds = async (): Promise<number> => {
  const summary = await requestJson<{ study_seconds: number }>(
    "/api/study-records/today-summary/",
  );
  return summary.study_seconds;
};

export const getStudyHistory = (offset = 0): Promise<StudyHistoryResponse> =>
  requestJson<StudyHistoryResponse>(
    `/api/study-records/history/?offset=${offset}`,
  );

export const deleteStudyRecord = (studyRecordId: number): Promise<void> =>
  deleteWithCsrf(`/api/study-records/${studyRecordId}/`);
