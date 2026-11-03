export type AuthUser = {
  email: string
}

type SessionResponse = {
  is_authenticated: boolean
  user: AuthUser | null
}

type UserResponse = {
  user: AuthUser
}

type ErrorResponse = {
  errors?: Record<string, string[]>
  detail?: string
}

export class AuthApiError extends Error {
  fieldErrors: Record<string, string[]>

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'AuthApiError'
    this.fieldErrors = fieldErrors
  }
}

const readJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  let response: Response

  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...init,
    })
  } catch {
    throw new AuthApiError(
      'サーバーへ接続できません。Djangoが起動しているか確認してください。',
    )
  }

  const responseBody = await readJson<T & ErrorResponse>(response)
  if (!response.ok) {
    if (response.status === 429) {
      throw new AuthApiError(
        '短時間に操作が繰り返されました。少し待ってから再度お試しください。',
      )
    }

    if (response.status === 403) {
      throw new AuthApiError(
        'セキュリティ確認に失敗しました。画面を再読み込みしてから再度お試しください。',
      )
    }

    throw new AuthApiError(
      responseBody?.detail ?? '入力内容を確認してください。',
      responseBody?.errors,
    )
  }

  return responseBody as T
}

const getCsrfToken = async (): Promise<string> => {
  const response = await requestJson<{ csrf_token: string }>('/api/auth/csrf/')
  return response.csrf_token
}

const postJsonWithCsrf = async <T>(url: string, requestBody: object): Promise<T> => {
  const csrfToken = await getCsrfToken()
  return requestJson<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrfToken,
    },
    body: JSON.stringify(requestBody),
  })
}

export const getSession = async (): Promise<AuthUser | null> => {
  const response = await requestJson<SessionResponse>('/api/auth/me/')
  return response.is_authenticated ? response.user : null
}

export const registerAccount = async (input: {
  email: string
  password: string
  passwordConfirmation: string
}): Promise<AuthUser> => {
  const response = await postJsonWithCsrf<UserResponse>('/api/auth/register/', {
    email: input.email,
    password: input.password,
    password_confirmation: input.passwordConfirmation,
  })
  return response.user
}

export const loginAccount = async (input: {
  email: string
  password: string
}): Promise<AuthUser> => {
  const response = await postJsonWithCsrf<UserResponse>('/api/auth/login/', input)
  return response.user
}

export const logoutAccount = async (): Promise<void> => {
  await postJsonWithCsrf<void>('/api/auth/logout/', {})
}
