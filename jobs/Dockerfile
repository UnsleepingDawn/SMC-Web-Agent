FROM python:3.12-slim

ARG HTTP_PROXY=http://host.docker.internal:7890
ARG HTTPS_PROXY=http://host.docker.internal:7890
ARG NO_PROXY=localhost,127.0.0.1,host.docker.internal
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies are installed into site-packages, outside /app, so the dev
# bind mount of ./jobs/src does not shadow them.
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir uv \
    && uv pip install --system --no-cache .

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

EXPOSE 8001

CMD ["python", "--version"]
