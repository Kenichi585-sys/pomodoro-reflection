import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const jsonResponse = (body: object, status = 200) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('未ログイン利用者へ3つの開始方法を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)

    expect(await screen.findByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新規登録' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'ログインせずタイマーを使う' }),
    ).toBeInTheDocument()
  })

  it('ゲスト利用を選ぶとタイマー画面の入口を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'ログインせずタイマーを使う' }),
    )

    expect(screen.getByLabelText('学習 25:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を開始' })).toBeInTheDocument()
    expect(screen.queryByText('今回の学習時間')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
  })

  it('タイマー開始後はログインと新規登録への移動を無効にする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'ログインせずタイマーを使う' }),
    )
    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))

    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '新規登録' })).toBeDisabled()
  })

  it('ログイン後にアカウントメニューからメールアドレスを確認できる', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ is_authenticated: false, user: null }),
      )
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-token' }))
      .mockResolvedValueOnce(
        jsonResponse({ user: { email: 'User@example.com' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'ログイン' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'safe-test-password-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    const accountButton = await screen.findByRole('button', { name: 'アカウント' })
    expect(screen.getByRole('heading', { name: '今回の目標を決める' })).toBeInTheDocument()
    expect(screen.queryByText('User@example.com')).not.toBeInTheDocument()
    fireEvent.click(accountButton)
    expect(screen.getByText('User@example.com')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/auth/login/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-CSRFToken': 'csrf-token' }),
      }),
    )
  })

  it('ログイン中もタイマー開始後はアカウント操作を無効にする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          is_authenticated: true,
          user: { email: 'User@example.com' },
        }),
      ),
    )

    render(<App />)
    const accountButton = await screen.findByRole('button', { name: 'アカウント' })
    fireEvent.click(accountButton)
    const logoutButton = screen.getByRole('button', { name: 'ログアウト' })
    fireEvent.click(screen.getByRole('button', { name: 'タイマーへ進む' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))

    expect(accountButton).toBeDisabled()
    expect(logoutButton).toBeDisabled()
  })

  it('ログイン欄ごとの入力エラーを対象の入力欄付近に表示する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ is_authenticated: false, user: null }),
      )
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-token' }))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            errors: {
              email: ['メールアドレスを入力してください。'],
              password: ['パスワードを入力してください。'],
            },
          },
          400,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'ログイン' }))
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(
      await screen.findByText('メールアドレスを入力してください。'),
    ).toBeInTheDocument()
    expect(screen.getByText('パスワードを入力してください。')).toBeInTheDocument()
  })

  it('新規登録画面に保存内容の案内を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '新規登録' }))

    expect(screen.getByLabelText('パスワード（確認）')).toBeInTheDocument()
    expect(
      screen.getByText(/管理者が保存内容を確認することがあります/),
    ).toBeInTheDocument()
  })

  it('ログイン画面と新規登録画面を相互に切り替えられる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '新規登録' }))

    expect(screen.getByRole('heading', { name: '新規登録' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))
    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新規登録' }))
    expect(screen.getByRole('heading', { name: '新規登録' })).toBeInTheDocument()
  })

  it('認証画面から最初の画面へ戻れる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'ログイン' }))
    fireEvent.click(screen.getByRole('button', { name: '最初の画面へ戻る' }))

    expect(
      screen.getByRole('heading', { name: '学習時間と振り返りを保存できます' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('学習 25:00')).not.toBeInTheDocument()
  })

  it('認証画面のアプリ名から最初の画面へ戻れる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ is_authenticated: false, user: null }),
      ),
    )

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '新規登録' }))
    fireEvent.click(
      screen.getByRole('button', { name: '振り返り付きポモドーロ' }),
    )

    expect(
      screen.getByRole('heading', { name: '学習時間と振り返りを保存できます' }),
    ).toBeInTheDocument()
  })

  it('ログアウト失敗をタイマー画面へ表示する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          is_authenticated: true,
          user: { email: 'User@example.com' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ study_seconds: 0 }))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-token' }))
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'ログアウト処理に失敗しました。' }, 500),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'アカウント' }))
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログアウト処理に失敗しました。',
    )
    expect(screen.getByRole('button', { name: 'アカウント' })).toBeInTheDocument()
  })

  it('学習時間を保存して振り返りを入力できる', async () => {
    const studyRecord = {
      id: 12,
      client_uuid: '00000000-0000-4000-8000-000000000001',
      study_date: '2026-11-11',
      started_at: '2026-11-11T09:00:00+09:00',
      ended_at: '2026-11-11T09:25:00+09:00',
      study_seconds: 25 * 60,
      goal: '',
      created_at: '2026-11-11T09:25:00+09:00',
      updated_at: '2026-11-11T09:25:00+09:00',
    }
    const reflection = {
      id: 3,
      worked_on: 'Serializerを読んだ',
      learned: '',
      impressions: '',
      next_action: '',
      created_at: '2026-11-11T09:26:00+09:00',
      updated_at: '2026-11-11T09:26:00+09:00',
    }
    const updatedReflection = {
      ...reflection,
      worked_on: 'Serializerを読み直した',
      updated_at: '2026-11-11T09:30:00+09:00',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          is_authenticated: true,
          user: { email: 'User@example.com' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ study_seconds: 0 }))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse(studyRecord, 201))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse(reflection, 201))
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse(updatedReflection))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'タイマーへ進む' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: '学習を開始' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を終了' }))
    fireEvent.click(
      screen.getByRole('button', { name: '学習時間を保存して振り返る' }),
    )

    expect(
      await screen.findByRole('heading', { name: '振り返り' }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('今回取り組んだこと'), {
      target: { value: 'Serializerを読んだ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(
      await screen.findByRole('heading', { name: '振り返りを保存しました' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Serializerを読んだ')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      '/api/study-records/12/reflection/',
      expect.objectContaining({ method: 'POST' }),
    )

    fireEvent.click(screen.getByRole('button', { name: '振り返りを編集' }))
    expect(
      screen.getByRole('heading', { name: '振り返りを編集' }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('今回取り組んだこと'), {
      target: { value: 'Serializerを読み直した' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8))
    expect(await screen.findByText('Serializerを読み直した')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      '/api/study-records/12/reflection/',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })
})
