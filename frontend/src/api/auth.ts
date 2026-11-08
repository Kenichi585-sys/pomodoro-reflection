import { postJsonWithCsrf, requestJson } from './client'

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
