import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Django APIの接続成功を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true }),
    )

    render(<App />)

    expect(
      await screen.findByText('Django APIに接続できました'),
    ).toBeInTheDocument()
  })
})
