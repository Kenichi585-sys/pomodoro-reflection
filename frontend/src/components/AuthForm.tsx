import { useState, type FormEvent } from 'react'

import { AuthApiError, type AuthUser } from '../api/auth'

export type AuthFormMode = 'login' | 'register'

type AuthFormProps = {
  mode: AuthFormMode
  onCancel: () => void
  onSwitchMode: (mode: AuthFormMode) => void
  onLogin: (input: { email: string; password: string }) => Promise<AuthUser>
  onRegister: (input: {
    email: string
    password: string
    passwordConfirmation: string
  }) => Promise<AuthUser>
  onSuccess: (user: AuthUser) => void
}

function firstError(errors: Record<string, string[]>, field: string) {
  return errors[field]?.[0]
}

export function AuthForm({
  mode,
  onCancel,
  onSwitchMode,
  onLogin,
  onRegister,
  onSuccess,
}: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isRegister = mode === 'register'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldErrors({})
    setFormError('')
    setIsSubmitting(true)

    try {
      const user = isRegister
        ? await onRegister({ email, password, passwordConfirmation })
        : await onLogin({ email, password })
      onSuccess(user)
    } catch (error) {
      if (error instanceof AuthApiError) {
        setFieldErrors(error.fieldErrors)
        setFormError(
          firstError(error.fieldErrors, 'non_field_errors') ?? error.message,
        )
      } else {
        setFormError('予期しないエラーが発生しました。')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">アカウント</p>
      <h1 id="auth-title">{isRegister ? '新規登録' : 'ログイン'}</h1>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby={firstError(fieldErrors, 'email') ? 'email-error' : undefined}
          required
        />
        {firstError(fieldErrors, 'email') && (
          <p className="field-error" id="email-error">
            {firstError(fieldErrors, 'email')}
          </p>
        )}

        <label htmlFor="password">パスワード</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={
            firstError(fieldErrors, 'password') ? 'password-error' : undefined
          }
          required
        />
        {firstError(fieldErrors, 'password') && (
          <p className="field-error" id="password-error">
            {firstError(fieldErrors, 'password')}
          </p>
        )}

        {isRegister && (
          <>
            <label htmlFor="password-confirmation">パスワード（確認）</label>
            <input
              id="password-confirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              aria-describedby={
                firstError(fieldErrors, 'password_confirmation')
                  ? 'password-confirmation-error'
                  : undefined
              }
              required
            />
            {firstError(fieldErrors, 'password_confirmation') && (
              <p className="field-error" id="password-confirmation-error">
                {firstError(fieldErrors, 'password_confirmation')}
              </p>
            )}

            <p className="privacy-note">
              登録したメールアドレスと振り返り内容を保存します。運用上必要な場合は、管理者が保存内容を確認することがあります。
            </p>
          </>
        )}

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? '処理しています'
            : isRegister
              ? 'アカウントを作成'
              : 'ログイン'}
        </button>
        <button className="text-button" type="button" onClick={onCancel}>
          最初の画面へ戻る
        </button>
        <div className="auth-switch">
          <span>
            {isRegister
              ? 'アカウントをお持ちの方'
              : 'アカウントをお持ちでない方'}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => onSwitchMode(isRegister ? 'login' : 'register')}
          >
            {isRegister ? 'ログイン' : '新規登録'}
          </button>
        </div>
      </form>
    </section>
  )
}
