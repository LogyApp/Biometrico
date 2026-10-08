FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY frontend-react/package.json frontend-react/package-lock.json* ./
RUN npm install
COPY frontend-react/ ./
RUN node -e "const fs=require('fs');const p='public/version.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version=new Date().toISOString();fs.writeFileSync(p,JSON.stringify(j,null,2));console.log('version.json stamped:',j.version);"
RUN npm run build

FROM python:3.11-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake \
        libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

RUN MPLBACKEND=Agg python -c "\
from insightface.app import FaceAnalysis; \
a = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); \
a.prepare(ctx_id=0, det_size=(640,640)); \
print('Modelo buffalo_l OK')" \
    || echo "Modelo se descargará en el primer arranque"


FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /venv            /venv
COPY --from=builder /root/.insightface /root/.insightface

ENV PATH="/venv/bin:$PATH"
ENV MPLBACKEND=Agg
ENV PORT=8080
ENV OMP_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV ORT_NUM_THREADS=1

WORKDIR /app
COPY backend/  ./backend/
COPY --from=frontend-builder /build/dist/ ./frontend/

ENV FRONTEND_DIR=/app/frontend

EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --log-level info --no-access-log"]
