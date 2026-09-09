FROM python:3.12-slim-bookworm

ARG HTTP_PROXY=http://host.docker.internal:7890
ARG HTTPS_PROXY=http://host.docker.internal:7890
ARG NO_PROXY=localhost,127.0.0.1,host.docker.internal
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV NO_PROXY=${NO_PROXY}

WORKDIR /app

# Dependencies are installed into site-packages, outside /app, so the dev
# bind mount of ./server/app does not shadow them.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir uv \
    && uv pip install --system --no-cache .

COPY migrations ./migrations
COPY alembic.ini ./
COPY gunicorn.config.py ./

CMD ["gunicorn", "-c", "gunicorn.config.py", "app.main:app"]
