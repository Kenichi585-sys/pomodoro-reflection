# 目標設定と振り返りが記録できるポモドーロタイマー

学習前に今回の目標を決め、ポモドーロタイマーで自分の学習時間を計測し、学習後に振り返りを記録できるWebアプリです。
学習中はブラウンノイズが流れます。

## 公開URL

[目標設定と振り返りが記録できるポモドーロタイマーを開く](https://pomodoro-reflection-25604475893.asia-southeast1.run.app/)

## 主な機能

- メールアドレスとパスワードによる新規登録、ログイン、ログアウト
- 学習前の目標設定
- 25分／5分と52分／17分を切り替えられるポモドーロタイマー
- ブラウンノイズ、休憩用BGM、音量、ミュート
- 休憩を除いた学習時間の保存
- 学習記録に対応する振り返りの作成、編集、削除
- 日付ごとにまとめた過去の学習記録と振り返りの表示
- ページを閉じた場合に、一定時間内であればタイマーの途中状態を復旧
- PCやスマートフォンへインストールし、通常のアプリのように起動できるPWA（Progressive Web App）対応

## 技術構成

- フロントエンド: React / TypeScript / Vite
- バックエンド: Django / Django REST Framework
- データベース: PostgreSQL（Neon）
- 本番実行環境: Google Cloud Run
- コンテナ: Docker
- ローカルのデータベース実行環境: Docker Compose

## 基本的な使い方

1. アカウントを作成してログインする。
2. 今回の目標を入力し、タイマーへ進む。
3. 学習と休憩を繰り返す。休憩中の時間は学習時間へ加算しない。
4. 「学習を終了」から学習時間を保存する。
5. 必要に応じて振り返りを記録する。
6. 過去の振り返り履歴から内容を確認・編集する。

## 初回セットアップ

必要なものはNode.js 24系（24.22.1以上）、Python 3.13系、Dockerです。

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

### 4. フロントエンドを準備して起動する

別のターミナルを開き、リポジトリ直下から実行します。

```bash
cd frontend
npm ci
npm run dev
```

`npm ci`は、`package-lock.json`に記録されたバージョンに従って、ReactやViteなどの依存パッケージをインストールします。Node.js自体はインストールされないため、事前に用意する必要があります。

画面は `http://localhost:5173/` で開きます。

### 5. ブラウザで起動を確認する

PostgreSQL、Django、フロントエンドを起動した状態で、次のURLを開きます。

- `http://127.0.0.1:8000/api/health/`: Djangoの接続確認
- `http://localhost:5173/`: Reactの画面確認

## テストと品質確認

次のコマンドは開発サーバーを起動するものではなく、自動テスト、静的検査、本番用ビルドを確認するものです。いずれもリポジトリ直下から実行します。

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
