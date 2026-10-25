import { useEffect, useState } from 'react'

import {
  AuthApiError,
  getSession,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthUser,
} from './api/auth'
import { AuthForm, type AuthFormMode } from './components/AuthForm'
import './App.css'

type Screen = 'loading' | 'welcome' | 'timer' | AuthFormMode

const GUEST_CHOICE_KEY = 'pomodoro-reflection:guest-choice'

function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [startupError, setStartupError] = useState('')

  useEffect(() => {
    let active = true

    getSession()
      .then((sessionUser) => {
        if (!active) return
        setUser(sessionUser)
        const guestSelected = localStorage.getItem(GUEST_CHOICE_KEY) === 'true'
        setScreen(sessionUser || guestSelected ? 'timer' : 'welcome')
      })
      .catch((error: unknown) => {
        if (!active) return
        setStartupError(
          error instanceof AuthApiError
            ? error.message
            : 'ログイン状態を確認できませんでした。',
        )
        setScreen('welcome')
      })

    return () => {
      active = false
    }
  }, [])

  function showTimerAsGuest() {
    localStorage.setItem(GUEST_CHOICE_KEY, 'true')
    setScreen('timer')
  }

  function handleAuthSuccess(authenticatedUser: AuthUser) {
    localStorage.removeItem(GUEST_CHOICE_KEY)
    setUser(authenticatedUser)
    setScreen('timer')
  }

  async function handleLogout() {
    setStartupError('')
    try {
      await logoutAccount()
      setUser(null)
      setAccountOpen(false)
      setScreen('welcome')
    } catch (error) {
      setStartupError(
        error instanceof AuthApiError
          ? error.message
          : 'ログアウトできませんでした。',
      )
    }
  }

  const timerVisible = screen === 'timer'
  const authVisible = screen === 'login' || screen === 'register'

  return (
    <div className="app-shell">
      <header className="app-header">
        {authVisible ? (
          <button
            className="brand-button"
            type="button"
            onClick={() => setScreen('welcome')}
          >
            振り返り付きポモドーロ
          </button>
        ) : (
          <span className="brand-label">振り返り付きポモドーロ</span>
        )}

        {timerVisible && (
          <nav aria-label="主要メニュー">
            {user ? (
              <div className="account-area">
                <button
                  className="header-button"
                  type="button"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((open) => !open)}
                >
                  アカウント
                </button>
                {accountOpen && (
                  <div className="account-menu">
                    <p>{user.email}</p>
                    <button type="button" onClick={handleLogout}>
                      ログアウト
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button className="header-button" type="button" onClick={() => setScreen('login')}>
                  ログイン
                </button>
                <button className="header-button" type="button" onClick={() => setScreen('register')}>
                  新規登録
                </button>
              </>
            )}
          </nav>
        )}
      </header>

      <main className="main-content">
        {screen === 'loading' && <p role="status">ログイン状態を確認しています</p>}

        {screen === 'welcome' && (
          <section className="welcome-card" aria-labelledby="welcome-title">
            <p className="eyebrow">学習の記録</p>
            <h1 id="welcome-title">学習時間と振り返りを保存できます</h1>
            <p>
              ログインすると、学習時間の集計と学習後の振り返りを利用できます。
            </p>
            {startupError && (
              <p className="form-error" role="alert">
                {startupError}
              </p>
            )}
            <div className="welcome-actions">
              <button className="primary-button" type="button" onClick={() => setScreen('login')}>
                ログイン
              </button>
              <button className="secondary-button" type="button" onClick={() => setScreen('register')}>
                新規登録
              </button>
              <button className="text-button" type="button" onClick={showTimerAsGuest}>
                ログインせずタイマーを使う
              </button>
            </div>
          </section>
        )}

        {(screen === 'login' || screen === 'register') && (
          <AuthForm
            key={screen}
            mode={screen}
            onCancel={() => setScreen('welcome')}
            onSwitchMode={setScreen}
            onLogin={loginAccount}
            onRegister={registerAccount}
            onSuccess={handleAuthSuccess}
          />
        )}

        {timerVisible && (
          <section className="timer-stage" aria-labelledby="timer-heading">
            <p className="eyebrow">25分 / 5分</p>
            <div className="timer-placeholder" aria-hidden="true">
              <span>25:00</span>
            </div>
            <h1 id="timer-heading">認証機能の準備ができました</h1>
            <p>タイマー機能は次の実装段階で追加します。</p>
            {startupError && (
              <p className="form-error" role="alert">
                {startupError}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default App
