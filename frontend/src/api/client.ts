type ErrorResponse = {
  errors?: Record<string, string[]>;
  detail?: string;
};

export class ApiError extends Error {
  fieldErrors: Record<string, string[]>;
  isOutcomeUncertain: boolean;

  constructor(
    message: string,
    fieldErrors: Record<string, string[]> = {},
    isOutcomeUncertain = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
    this.isOutcomeUncertain = isOutcomeUncertain;
  }
}

const readJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const requestJson = async <T>(
  url: string,
  init?: RequestInit,
  uncertainOnServerError = false,
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...init,
    });
  } catch {
    throw new ApiError(
      "サーバーへ接続できません。Djangoが起動しているか確認してください。",
      {},
      true,
    );
  }

  const responseBody = await readJson<T & ErrorResponse>(response);
  if (!response.ok) {
    if (uncertainOnServerError && response.status >= 500) {
      throw new ApiError(
        "サーバーでの処理結果を確認できませんでした。同じ内容で再度お試しください。",
        {},
        true,
      );
    }

    if (response.status === 429) {
      throw new ApiError(
        "短時間に操作が繰り返されました。少し待ってから再度お試しください。",
      );
    }

    if (response.status === 403) {
      throw new ApiError(
        "セキュリティ確認に失敗しました。画面を再読み込みしてから再度お試しください。",
      );
    }

    throw new ApiError(
      responseBody?.detail ?? "入力内容を確認してください。",
      responseBody?.errors,
    );
  }

  if (responseBody === null && response.status !== 204) {
    throw new ApiError(
      "サーバーからの応答を確認できませんでした。同じ内容で再度お試しください。",
      {},
      true,
    );
  }

  return responseBody as T;
};

const getCsrfToken = async (): Promise<string> => {
  const response = await requestJson<{ csrf_token: string }>(
    "/api/auth/csrf/",
  );
  return response.csrf_token;
};

export const postJsonWithCsrf = async <T>(
  url: string,
  requestBody: object,
  uncertainOnServerError = false,
  onRequestStarted?: () => void,
): Promise<T> => {
  let csrfToken: string;
  try {
    csrfToken = await getCsrfToken();
  } catch (error) {
    if (error instanceof ApiError && error.isOutcomeUncertain) {
      throw new ApiError(error.message, error.fieldErrors);
    }
    throw error;
  }

  onRequestStarted?.();
  return requestJson<T>(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify(requestBody),
    },
    uncertainOnServerError,
  );
};
