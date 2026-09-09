"""Session-level Postgres advisory lock helpers.

Advisory locks serialize work across concurrent requests/processes without a
dedicated lock table. We use *session-level* locks (``pg_try_advisory_lock``,
not the ``_xact_`` variant) because a webhook handler issues intermediate
commits, and a transaction-level lock would be released by the first of those.

The lock is held on its own dedicated connection rather than on the request's
ORM session: SQLAlchemy returns a Session's connection to the pool on every
``commit()``, so a lock taken through the Session would not reliably survive the
handler's commits.
"""

import logging
from contextlib import contextmanager
from typing import Iterator, Optional

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

logger = logging.getLogger(__name__)


class AdvisoryLockNamespace:
    """Stable int4 namespaces for advisory locks. Keep values unique."""

    FEISHU_SYNC_WEBHOOK = 1936814703  # arbitrary int4 constant ("fsyn")


class AdvisoryLock:
    """A non-blocking, session-level Postgres advisory lock on its own connection."""

    def __init__(self, engine: Engine, *, namespace: int, key: str) -> None:
        self._engine = engine
        self._namespace = namespace
        self._key = key
        self._conn: Optional[Connection] = None

    def acquire(self) -> bool:
        """Try to take the lock. Returns False if another process holds it."""
        conn = self._engine.connect()
        try:
            acquired = bool(
                conn.execute(
                    text("SELECT pg_try_advisory_lock(:ns, hashtext(:key))"),
                    {"ns": self._namespace, "key": self._key},
                ).scalar()
            )
        except Exception:
            conn.close()
            raise

        if acquired:
            self._conn = conn
            return True

        conn.close()
        return False

    def release(self) -> None:
        """Release the lock and return its connection to the pool. Never raises."""
        if self._conn is None:
            return
        try:
            self._conn.execute(
                text("SELECT pg_advisory_unlock(:ns, hashtext(:key))"),
                {"ns": self._namespace, "key": self._key},
            )
        except Exception as e:
            logger.error(
                f"Failed to release advisory lock (ns={self._namespace}, "
                f"key={self._key}): {str(e)}"
            )
        finally:
            self._conn.close()
            self._conn = None


@contextmanager
def advisory_lock(engine: Engine, *, namespace: int, key: str) -> Iterator[bool]:
    """Yield whether the lock was acquired, releasing it on exit if it was."""
    lock = AdvisoryLock(engine, namespace=namespace, key=key)
    acquired = lock.acquire()
    try:
        yield acquired
    finally:
        if acquired:
            lock.release()
