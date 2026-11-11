import { useEffect, useState } from "react";

import {
  getSession,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AuthUser,
} from "./api/auth";
import { ApiError } from "./api/client";
import {
  createReflection,
  updateReflection,
  type Reflection,
} from "./api/reflections";
import { createStudyRecord, type StudyRecord } from "./api/studyRecords";
import { AuthForm, type AuthFormMode } from "./components/AuthForm";
import { ReflectionForm } from "./components/ReflectionForm";
import { StudyRecordDetail } from "./components/StudyRecordDetail";
import { TimerPanel } from "./components/TimerPanel";
import "./App.css";

type Screen =
  | "loading"
  | "welcome"
  | "timer"
  | "reflection"
  | "reflection-detail"
  | AuthFormMode;

const GUEST_CHOICE_KEY = "pomodoro-reflection:guest-choice";

const App = () => {
  const [screen, setScreen] = useState<Screen>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isTimerNavigationLocked, setIsTimerNavigationLocked] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [reflectionStudyRecord, setReflectionStudyRecord] =
    useState<StudyRecord | null>(null);
  const [savedReflection, setSavedReflection] = useState<Reflection | null>(
    null,
  );

  useEffect(() => {
    let isSessionRequestActive = true;

    getSession()
      .then((sessionUser) => {
        if (!isSessionRequestActive) return;
        setUser(sessionUser);
        const isGuestModeSelected =
          localStorage.getItem(GUEST_CHOICE_KEY) === "true";
        setScreen(sessionUser || isGuestModeSelected ? "timer" : "welcome");
      })
      .catch((error: unknown) => {
        if (!isSessionRequestActive) return;
        setStartupError(
          error instanceof ApiError
            ? error.message
            : "ログイン状態を確認できませんでした。",
        );
        setScreen("welcome");
      });

    return () => {
      isSessionRequestActive = false;
    };
  }, []);

  const showTimerAsGuest = () => {
    localStorage.setItem(GUEST_CHOICE_KEY, "true");
    setScreen("timer");
  };

  const handleAuthSuccess = (authenticatedUser: AuthUser) => {
    localStorage.removeItem(GUEST_CHOICE_KEY);
    setUser(authenticatedUser);
    setScreen("timer");
  };

  const handleLogout = async () => {
    setStartupError("");
    try {
      await logoutAccount();
      setUser(null);
      setIsAccountMenuOpen(false);
      setScreen("welcome");
    } catch (error) {
      setStartupError(
        error instanceof ApiError
          ? error.message
          : "ログアウトできませんでした。",
      );
    }
  };

  const startReflection = (studyRecord: StudyRecord) => {
    setReflectionStudyRecord(studyRecord);
    setSavedReflection(null);
    setScreen("reflection");
  };

  const finishReflection = (reflection: Reflection) => {
    setSavedReflection(reflection);
    setScreen("reflection-detail");
  };

  const returnToNewTimer = () => {
    setReflectionStudyRecord(null);
    setSavedReflection(null);
    setScreen("timer");
  };

  const cancelReflection = () => {
    if (savedReflection !== null) {
      setScreen("reflection-detail");
      return;
    }
    returnToNewTimer();
  };

  const isTimerVisible = screen === "timer";
  const isAuthVisible = screen === "login" || screen === "register";

  return (
    <div className="app-shell">
      <header className="app-header">
        {isAuthVisible ? (
          <button
            className="brand-button"
            type="button"
            onClick={() => setScreen("welcome")}
          >
            振り返り付きポモドーロ
          </button>
        ) : (
          <span className="brand-label">振り返り付きポモドーロ</span>
        )}

        {isTimerVisible && (
          <nav aria-label="主要メニュー">
            {user ? (
              <div className="account-area">
                <button
                  className="header-button"
                  type="button"
                  aria-expanded={isAccountMenuOpen}
                  disabled={isTimerNavigationLocked}
                  onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
                >
                  アカウント
                </button>
                {isAccountMenuOpen && (
                  <div className="account-menu">
                    <p>{user.email}</p>
                    <button
                      type="button"
                      disabled={isTimerNavigationLocked}
                      onClick={handleLogout}
                    >
                      ログアウト
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  className="header-button"
                  type="button"
                  disabled={isTimerNavigationLocked}
                  onClick={() => setScreen("login")}
                >
                  ログイン
                </button>
                <button
                  className="header-button"
                  type="button"
                  disabled={isTimerNavigationLocked}
                  onClick={() => setScreen("register")}
                >
                  新規登録
                </button>
              </>
            )}
          </nav>
        )}
      </header>

      <main className="main-content">
        {screen === "loading" && (
          <p role="status">ログイン状態を確認しています</p>
        )}

        {screen === "welcome" && (
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
              <button
                className="primary-button"
                type="button"
                onClick={() => setScreen("login")}
              >
                ログイン
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setScreen("register")}
              >
                新規登録
              </button>
              <button
                className="text-button"
                type="button"
                onClick={showTimerAsGuest}
              >
                ログインせずタイマーを使う
              </button>
            </div>
          </section>
        )}

        {(screen === "login" || screen === "register") && (
          <AuthForm
            key={screen}
            mode={screen}
            onCancel={() => setScreen("welcome")}
            onSwitchMode={setScreen}
            onLogin={loginAccount}
            onRegister={registerAccount}
            onSuccess={handleAuthSuccess}
          />
        )}

        {isTimerVisible && (
          <>
            <TimerPanel
              showStudyTime={user !== null}
              recoveryOwnerKey={user ? `user:${user.email}` : "guest"}
              onCreateStudyRecord={user ? createStudyRecord : undefined}
              onStartReflection={user ? startReflection : undefined}
              onTimerNavigationLockChange={setIsTimerNavigationLocked}
            />
            {startupError && (
              <p className="form-error" role="alert">
                {startupError}
              </p>
            )}
          </>
        )}

        {screen === "reflection" && reflectionStudyRecord !== null && (
          <ReflectionForm
            studyRecord={reflectionStudyRecord}
            initialReflection={savedReflection ?? undefined}
            onSubmit={(input) =>
              savedReflection === null
                ? createReflection(reflectionStudyRecord.id, input)
                : updateReflection(reflectionStudyRecord.id, input)
            }
            onSaved={finishReflection}
            onCancel={cancelReflection}
          />
        )}

        {screen === "reflection-detail" &&
          reflectionStudyRecord !== null &&
          savedReflection !== null && (
            <StudyRecordDetail
              studyRecord={reflectionStudyRecord}
              reflection={savedReflection}
              onEditReflection={() => setScreen("reflection")}
              onStartNewStudy={returnToNewTimer}
            />
          )}
      </main>
    </div>
  );
};

export default App;
