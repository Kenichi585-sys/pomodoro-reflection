# 振り返り付きポモドーロ

ポモドーロタイマーで学習時間を記録し、学習後の振り返りと次の行動を残すPWAです。

現在はメールアドレスとパスワードによる新規登録・ログイン・ログアウトまで実装済みです。タイマー、学習記録、振り返りの各機能は、次の実装段階で追加します。

## 技術構成

- フロントエンド: React / TypeScript / Vite
- バックエンド: Django / Django REST Framework
- データベース: PostgreSQL
- ローカルのデータベース実行環境: Docker Compose

## 初回セットアップ

必要なものはNode.js 24系（24.22.1以上）、Python 3.13、Dockerです。

### 1. 環境変数を用意する

```bash
cp .env.example .env
```

`.env.example`の値はローカル開発専用です。本番環境では、パスワードとDjangoの秘密鍵を必ず別の値へ変更します。

### 2. PostgreSQLを起動する

```bash
docker compose up -d db
```

### 3. Djangoを準備する

リポジトリ直下で実行します。

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
../.venv/bin/python manage.py migrate
../.venv/bin/python manage.py runserver
```

Djangoは `http://127.0.0.1:8000/`、接続確認用APIは `http://127.0.0.1:8000/api/health/` で起動します。

### 4. Reactを起動する

別のターミナルで実行します。

```bash
cd frontend
npm install
npm run dev
```

画面は `http://localhost:5173/` で開きます。新規登録、ログイン、ログアウト、ゲスト利用の入口を確認できます。

## 動作確認

### バックエンド

```bash
cd backend
../.venv/bin/python manage.py check
../.venv/bin/python manage.py test
```

### フロントエンド

```bash
cd frontend
npm run lint
npm run test
npm run build
```

## PostgreSQLを止める

```bash
docker compose stop db
```

`docker compose stop`では保存済みデータは削除されません。

## 設計資料

要件定義、基本設計、画面設計などは [`docs`](./docs) にまとめています。
