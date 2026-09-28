FROM python:3.12-slim

# Build-time proxy for apt/pip/uv. Docker's predefined ARGs inject these into RUN
# during the build only and are never persisted into the image. Do NOT turn them
# into ENV: that would bake the proxy into the image and route runtime traffic
# (including domestic services such as the Feishu open platform) through it.
ARG HTTP_PROXY=http://host.docker.internal:7890
ARG HTTPS_PROXY=http://host.docker.internal:7890
ARG NO_PROXY=localhost,127.0.0.1,host.docker.internal

WORKDIR /app

# uv installs into /app/.venv; putting it first on PATH makes the image CMD and
# the dev commands in compose.dev.yml (python -m ...) resolve to the venv.
ENV PATH="/app/.venv/bin:$PATH"

RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dependency layer: third-party deps only, so editing src/ keeps the cache.
# --frozen forbids re-resolving and fails if uv.lock drifts from pyproject.toml.
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-install-project

# Project layer: install this package editable so the dev bind mount of
# ./jobs/src takes effect without reinstalling.
COPY src/ ./src/
RUN uv sync --frozen

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

EXPOSE 8001

CMD ["python", "--version"]
