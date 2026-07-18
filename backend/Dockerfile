FROM python:3.12-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY pyproject.toml uv.lock ./

RUN uv sync --no-dev --no-install-project

COPY . .

RUN uv sync --no-dev

EXPOSE 8081

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8081", "--workers", "2", "--timeout-graceful-shutdown", "30"]
