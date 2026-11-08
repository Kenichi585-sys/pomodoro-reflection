import { useState, type SubmitEvent } from "react";

import { type AuthUser } from "../api/auth";
import { ApiError } from "../api/client";

export type AuthFormMode = "login" | "register";

type AuthFormProps = {
  mode: AuthFormMode;
  onCancel: () => void;
  onSwitchMode: (mode: AuthFormMode) => void;
  onLogin: (input: { email: string; password: string }) => Promise<AuthUser>;
  onRegister: (input: {
    email: string;
    password: string;
    passwordConfirmation: string;
  }) => Promise<AuthUser>;
  onSuccess: (user: AuthUser) => void;
};

const getFirstFieldError = (errors: Record<string, string[]>, fieldName: string) => {
  return errors[fieldName]?.[0];
};

export const AuthForm = ({
  mode,
  onCancel,
  onSwitchMode,
  onLogin,
  onRegister,
  onSuccess,
}: AuthFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegistrationMode = mode === "register";

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError("");
    setIsSubmitting(true);

    try {
      const authenticatedUser = isRegistrationMode
        ? await onRegister({ email, password, passwordConfirmation })
        : await onLogin({ email, password });
      onSuccess(authenticatedUser);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        setFormError(
          getFirstFieldError(error.fieldErrors, "non_field_errors") ?? error.message,
        );
      } else {
        setFormError("予期しないエラーが発生しました。");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">アカウント</p>
      <h1 id="auth-title">{isRegistrationMode ? "新規登録" : "ログイン"}</h1>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">メールアドレス</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby={
            getFirstFieldError(fieldErrors, "email") ? "email-error" : undefined
          }
          required
        />
        {getFirstFieldError(fieldErrors, "email") && (
          <p className="field-error" id="email-error">
            {getFirstFieldError(fieldErrors, "email")}
          </p>
        )}

        <label htmlFor="password">パスワード</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegistrationMode ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={
            getFirstFieldError(fieldErrors, "password") ? "password-error" : undefined
          }
          required
        />
        {getFirstFieldError(fieldErrors, "password") && (
          <p className="field-error" id="password-error">
            {getFirstFieldError(fieldErrors, "password")}
          </p>
        )}

        {isRegistrationMode && (
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
                getFirstFieldError(fieldErrors, "password_confirmation")
                  ? "password-confirmation-error"
                  : undefined
              }
              required
            />
            {getFirstFieldError(fieldErrors, "password_confirmation") && (
              <p className="field-error" id="password-confirmation-error">
                {getFirstFieldError(fieldErrors, "password_confirmation")}
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

        <button
          className="primary-button"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "処理しています"
            : isRegistrationMode
              ? "アカウントを作成"
              : "ログイン"}
        </button>
        <button className="text-button" type="button" onClick={onCancel}>
          最初の画面へ戻る
        </button>
        <div className="auth-switch">
          <span>
            {isRegistrationMode
              ? "アカウントをお持ちの方"
              : "アカウントをお持ちでない方"}
          </span>
          <button
            className="text-button"
            type="button"
            onClick={() => onSwitchMode(isRegistrationMode ? "login" : "register")}
          >
            {isRegistrationMode ? "ログイン" : "新規登録"}
          </button>
        </div>
      </form>
    </section>
  );
};
