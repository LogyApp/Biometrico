#!/bin/sh
# Script de inicio — Cloud Run inyecta $PORT automáticamente (default 8080)
exec uvicorn main:app \
  --app-dir /app/backend \
  --host 0.0.0.0 \
  --port "${PORT:-8080}" \
  --workers 1 \
  --log-level info \
  --timeout-keep-alive 30
