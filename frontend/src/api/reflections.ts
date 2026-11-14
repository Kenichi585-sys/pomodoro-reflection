import {
  deleteWithCsrf,
  patchJsonWithCsrf,
  postJsonWithCsrf,
} from "./client";

export type ReflectionInput = {
  worked_on?: string;
  learned?: string;
  impressions?: string;
  next_action?: string;
};

export type Reflection = Required<ReflectionInput> & {
  id: number;
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

export const deleteReflection = (studyRecordId: number): Promise<void> =>
  deleteWithCsrf(reflectionUrl(studyRecordId));
