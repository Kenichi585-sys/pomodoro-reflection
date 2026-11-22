# 目標設定と振り返りが記録できるポモドーロタイマー

学習前に今回の目標を決め、ポモドーロタイマーで集中時間を記録し、学習後の振り返りと次の行動を残せるPWAです。

## 主な機能

- メールアドレスとパスワードによる新規登録、ログイン、ログアウト
- 学習前の目標設定
- 25分／5分と52分／17分を切り替えられるポモドーロタイマー
- 学習音、休憩用BGM、音量、ミュート
- 休憩を除いた集中時間の保存
- 学習記録に対応する振り返りの作成、編集、削除
- 日付ごとにまとめた過去の学習記録と振り返りの表示
- タイマーの途中状態の復旧とPWA対応

## 技術構成

- フロントエンド: React / TypeScript / Vite
- バックエンド: Django / Django REST Framework
- データベース: PostgreSQL
- ローカルのデータベース実行環境: Docker Compose

## 基本的な使い方

1. アカウントを作成してログインする。
2. 今回の目標を入力し、タイマーへ進む。
3. 学習と休憩を繰り返す。休憩中の時間は学習時間へ加算しない。
4. 「学習を終了」から学習時間を保存する。
5. 必要に応じて振り返りを記録し、過去の履歴から確認・編集する。

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

画面は `http://localhost:5173/` で開きます。

### 5173と4173の使い分け

- `5173`は`npm run dev`で起動する開発用画面です。ソースコードの変更を監視し、保存した内容をすぐ画面へ反映します。
- `4173`は`npm run build`で作った成果物を`npm run preview`で確認する画面です。インストール済みPWAやService Workerを含む、本番に近い動作確認に使用します。
- `4173`で以前のCSSや音源が表示される場合は、先に最新のビルドを作成し、`Ctrl + Shift + R`でキャッシュを無視して再読み込みします。

```bash
cd frontend
npm run build
npm run preview -- --host 127.0.0.1
```

タイマーの状態遷移を短時間で確認する場合は、開発環境で次のURLを開きます。

```text
http://localhost:5173/?timerTest=1
```

このURLでは、学習時間と休憩時間がそれぞれ7秒になります。開発環境だけで有効になり、本番環境のタイマー設定には影響しません。

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
