import { postJsonWithCsrf } from "./client";

export type CreateStudyRecordInput = {
  client_uuid: string;
  started_at: string;
  ended_at: string;
  study_seconds: number;
  preset: "25-5" | "52-17";
  focus_seconds: number;
  break_seconds: number;
  completed_focus_count: number;
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
