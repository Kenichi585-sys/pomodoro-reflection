import { patchJsonWithCsrf, postJsonWithCsrf } from "./client";

export type ReflectionScore =
  | 0
  | 10
  | 20
  | 30
  | 40
  | 50
  | 60
  | 70
  | 80
  | 90
  | 100;

export type AiUsageState = "unanswered" | "used" | "unused";

export type ReflectionDeepDiveInput = {
  content: string;
};

export type ReflectionInput = {
  worked_on?: string;
  difficulty?: string;
  attempted?: string;
  understanding_change?: string;
  next_action?: string;
  ai_usage_state?: AiUsageState;
  ai_communication_score?: ReflectionScore | null;
  ai_thinking_score?: ReflectionScore | null;
  outcome_score?: ReflectionScore | null;
  outcome_evidence?: string;
  deep_dives?: ReflectionDeepDiveInput[];
};

export type ReflectionDeepDive = ReflectionDeepDiveInput & {
  id: number;
  display_order: number;
};

export type Reflection = Required<Omit<ReflectionInput, "deep_dives">> & {
  id: number;
  deep_dives: ReflectionDeepDive[];
  created_at: string;
  updated_at: string;
};

const reflectionUrl = (studyRecordId: number): string =>
  `/api/study-records/${studyRecordId}/reflection/`;

export const createReflection = (
  studyRecordId: number,
  input: ReflectionInput,
): Promise<Reflection> =>
  postJsonWithCsrf<Reflection>(reflectionUrl(studyRecordId), input, true);

export const updateReflection = (
  studyRecordId: number,
  input: ReflectionInput,
): Promise<Reflection> =>
  patchJsonWithCsrf<Reflection>(reflectionUrl(studyRecordId), input, true);
