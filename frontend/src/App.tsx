import { useEffect, useState } from 'react'
import './App.css'

type ApiStatus = 'checking' | 'online' | 'offline'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/health/', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('API health check failed')
        }
        setApiStatus('online')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setApiStatus('offline')
      })

    return () => controller.abort()
  }, [])

  const statusText = {
    checking: '接続を確認しています',
    online: 'Django APIに接続できました',
    offline: 'Django APIを起動すると接続状態を確認できます',
  }[apiStatus]

  return (
    <main className="setup-page">
      <section className="setup-card">
        <p className="eyebrow">開発環境</p>
        <h1>振り返り付きポモドーロ</h1>
        <p>ReactとDjangoの骨組みを確認するための一時画面です。</p>
        <p className={`api-status api-status--${apiStatus}`} role="status">
          {statusText}
        </p>
      </section>
    </main>
  )
}

export default App
