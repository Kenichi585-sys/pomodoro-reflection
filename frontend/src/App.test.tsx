import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

function jsonResponse(body: object, status = 200) {
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

    expect(
      screen.getByRole('heading', { name: '認証機能の準備ができました' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
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
})
