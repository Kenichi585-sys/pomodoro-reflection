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

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
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

  const body = await readJson<T & ErrorResponse>(response)
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
      body?.detail ?? '入力内容を確認してください。',
      body?.errors,
    )
  }

  return body as T
}

const csrfToken = async (): Promise<string> => {
  const response = await request<{ csrf_token: string }>('/api/auth/csrf/')
  return response.csrf_token
}

const post = async <T>(url: string, body: object): Promise<T> => {
  const token = await csrfToken()
  return request<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': token,
    },
    body: JSON.stringify(body),
  })
}

export const getSession = async (): Promise<AuthUser | null> => {
  const response = await request<SessionResponse>('/api/auth/me/')
  return response.is_authenticated ? response.user : null
}

export const registerAccount = async (input: {
  email: string
  password: string
  passwordConfirmation: string
}): Promise<AuthUser> => {
  const response = await post<UserResponse>('/api/auth/register/', {
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
  const response = await post<UserResponse>('/api/auth/login/', input)
  return response.user
}

export const logoutAccount = async (): Promise<void> => {
  await post<void>('/api/auth/logout/', {})
}
