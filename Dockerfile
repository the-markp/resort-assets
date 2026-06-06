# ─── Build stage ──────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim

LABEL maintainer="Palma Resort Asset Management"
LABEL description="Resort Asset Management System — FastAPI + DynamoDB"

WORKDIR /app

# Copy installed dependencies
COPY --from=builder /install /usr/local

# Copy application code — paths are relative to the build context (project root)
COPY app/                         ./app/
COPY frontend/templates/          ./frontend/templates/
COPY frontend/static/             ./frontend/static/

# Create non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/dashboard/summary')" || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
