import { useEffect, useRef, useState } from "react";

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
  deleteReflection,
  updateReflection,
  type Reflection,
} from "./api/reflections";
import {
  createStudyRecord,
  deleteStudyRecord,
  getStudyHistory,
  getStudySecondsForDate,
  type StudyRecord,
} from "./api/studyRecords";
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
  | "reflection-skipped"
  | AuthFormMode;

const GUEST_CHOICE_KEY = "pomodoro-reflection:guest-choice";

const App = () => {
  // 現在表示している画面。
  const [screen, setScreen] = useState<Screen>("loading");
  // ログイン中の利用者。未ログイン時はnull。
  const [user, setUser] = useState<AuthUser | null>(null);
  // アカウントメニューを表示しているか。
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  // アカウントメニューと開閉ボタンを含む領域。
  const accountAreaRef = useRef<HTMLDivElement>(null);
  // タイマー動作中など、別画面への移動を禁止しているか。
  const [isTimerNavigationLocked, setIsTimerNavigationLocked] = useState(false);
  // アプリ起動時の処理に失敗した場合に表示するメッセージ。
  const [startupError, setStartupError] = useState("");
  // 振り返りの対象となる、保存済みの学習記録。
  const [reflectionStudyRecord, setReflectionStudyRecord] =
    useState<StudyRecord | null>(null);
  // Djangoから返され、画面表示や編集に使う保存済みの振り返り。
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

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const closeAccountMenuOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        accountAreaRef.current?.contains(event.target)
      ) {
        return;
      }
      setIsAccountMenuOpen(false);
    };
    const closeAccountMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeAccountMenuOnOutsideClick);
    document.addEventListener("keydown", closeAccountMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeAccountMenuOnOutsideClick);
      document.removeEventListener("keydown", closeAccountMenuOnEscape);
    };
  }, [isAccountMenuOpen]);

  const showTimerAsGuest = () => {
    localStorage.setItem(GUEST_CHOICE_KEY, "true");
    setStartupError("");
    setScreen("timer");
  };

  const handleAuthSuccess = (authenticatedUser: AuthUser) => {
    localStorage.removeItem(GUEST_CHOICE_KEY);
    setStartupError("");
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

  const returnToGoalSetup = () => {
    setReflectionStudyRecord(null);
    setSavedReflection(null);
    setScreen("timer");
  };

  const skipReflection = () => {
    if (savedReflection !== null) {
      setScreen("reflection-detail");
      return;
    }
    setScreen("reflection-skipped");
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
            目標設定と振り返りが記録できるポモドーロタイマー
          </button>
        ) : (
          <span className="brand-label">
            目標設定と振り返りが記録できるポモドーロタイマー
          </span>
        )}

        {isTimerVisible && (
          <nav aria-label="主要メニュー">
            {user ? (
              <div className="account-area" ref={accountAreaRef}>
                <button
                  className="header-button"
                  type="button"
                  aria-expanded={isAccountMenuOpen}
                  aria-controls="account-menu"
                  disabled={isTimerNavigationLocked}
                  onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
                >
                  メニュー
                </button>
                {isAccountMenuOpen && (
                  <div className="account-menu" id="account-menu">
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
              loadStudySecondsForDate={
                user ? getStudySecondsForDate : undefined
              }
              loadStudyHistory={user ? getStudyHistory : undefined}
              deleteStudyRecord={user ? deleteStudyRecord : undefined}
              createReflection={user ? createReflection : undefined}
              updateReflection={user ? updateReflection : undefined}
              deleteReflection={user ? deleteReflection : undefined}
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
            onDelete={() => deleteReflection(reflectionStudyRecord.id)}
            onDeleted={() => {
              setSavedReflection(null);
              setScreen("reflection-skipped");
            }}
            onSkip={skipReflection}
          />
        )}

        {screen === "reflection-skipped" &&
          reflectionStudyRecord !== null && (
            <section className="welcome-card" aria-labelledby="reflection-skipped-title">
              <p className="eyebrow">学習終了</p>
              <h1 id="reflection-skipped-title">学習時間を保存しました</h1>
              <p>振り返りは保存していません。</p>
              <div className="welcome-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={returnToGoalSetup}
                >
                  目標設定画面へ戻る
                </button>
              </div>
            </section>
          )}

        {screen === "reflection-detail" &&
          reflectionStudyRecord !== null &&
          savedReflection !== null && (
            <StudyRecordDetail
              studyRecord={reflectionStudyRecord}
              reflection={savedReflection}
              onEditReflection={() => setScreen("reflection")}
              onBackToGoalSetup={returnToGoalSetup}
            />
          )}
      </main>
    </div>
  );
};

export default App;
