# syntax=docker/dockerfile:1

FROM node:24.22.1-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.13.18-slim-bookworm AS application

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production \
    PORT=8080

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY backend/requirements.txt ./backend/requirements.txt
RUN python -m pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist/

# collectstaticはデータベースへ接続しない。ここでは本番設定の読込に必要な
# ビルド専用の非秘密値だけを渡し、実際の秘密情報はイメージへ含めない。
RUN DJANGO_SECRET_KEY=build-only-not-a-secret \
    DJANGO_ALLOWED_HOSTS=localhost \
    DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost \
    DATABASE_URL='postgresql://build:build@localhost:5432/build?sslmode=require&channel_binding=require' \
    DJANGO_NUM_PROXIES=0 \
    python backend/manage.py collectstatic \
      --noinput \
      --settings=config.settings.production

WORKDIR /app/backend

USER app

EXPOSE 8080

CMD ["sh", "-c", "exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 120 --no-control-socket"]
