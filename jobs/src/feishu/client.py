"""Minimal Feishu open-platform REST client.

The original project used the ``lark-oapi`` SDK; the calls it made are plain
REST endpoints, so this module talks to them directly and keeps the dependency
list small. Only the endpoints the lab actually needs are wrapped.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Iterator, List, Optional

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://open.feishu.cn/open-apis"
# The token is valid for 7200 seconds; refresh a little early to avoid a request
# failing on the boundary.
_TOKEN_TTL_SECONDS = 7000


class FeishuAPIError(RuntimeError):
    """Raised when Feishu answers with a non-zero business code."""

    def __init__(self, code: int, message: str, path: str) -> None:
        super().__init__(f"Feishu API {path} failed (code={code}): {message}")
        self.code = code
        self.message = message


class FeishuClient:
    """Holds the tenant access token and issues authenticated requests."""

    def __init__(self, app_id: str, app_secret: str, timeout: int = 30) -> None:
        self._app_id = app_id
        self._app_secret = app_secret
        self._timeout = timeout
        self._token: Optional[str] = None
        self._token_acquired_at = 0.0
        self._lock = threading.Lock()

    def _tenant_access_token(self) -> str:
        with self._lock:
            if self._token and time.time() - self._token_acquired_at < _TOKEN_TTL_SECONDS:
                return self._token

            response = requests.post(
                f"{BASE_URL}/auth/v3/tenant_access_token/internal",
                json={"app_id": self._app_id, "app_secret": self._app_secret},
                timeout=self._timeout,
            )
            data = response.json()
            if data.get("code") != 0:
                raise FeishuAPIError(
                    int(data.get("code", -1)),
                    str(data.get("msg", "unknown error")),
                    "auth/v3/tenant_access_token/internal",
                )
            self._token = str(data["tenant_access_token"])
            self._token_acquired_at = time.time()
            return self._token

    @property
    def tenant_access_token(self) -> str:
        return self._tenant_access_token()

    def request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        expect_data: bool = True,
    ) -> Dict[str, Any]:
        """Issue an authenticated request and return the ``data`` object."""
        response = requests.request(
            method,
            f"{BASE_URL}/{path}",
            params=params,
            json=json_body,
            headers={
                "Authorization": f"Bearer {self._tenant_access_token()}",
                "Content-Type": "application/json; charset=utf-8",
            },
            timeout=self._timeout,
        )
        payload = response.json()
        if payload.get("code") != 0:
            raise FeishuAPIError(
                int(payload.get("code", -1)),
                str(payload.get("msg", "unknown error")),
                path,
            )
        if not expect_data:
            return {}
        return payload.get("data") or {}

    def paginate(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        page_size: int = 100,
        items_key: str = "items",
        page_token_key: str = "page_token",
    ) -> Iterator[List[Dict[str, Any]]]:
        """Yield one page of ``items`` at a time until Feishu says there is no more."""
        page_token = ""
        while True:
            page_params = dict(params or {})
            page_params["page_size"] = page_size
            if page_token:
                page_params["page_token"] = page_token

            body = dict(json_body or {})
            if body:
                body["page_size"] = page_size
                body["page_token"] = page_token

            data = self.request(method, path, params=page_params, json_body=body or None)
            items = data.get(items_key) or []
            if items:
                yield items

            if not data.get("has_more"):
                return
            page_token = str(data.get(page_token_key, ""))
            if not page_token:
                return
