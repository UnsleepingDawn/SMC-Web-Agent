import os
from datetime import datetime, timezone
from typing import Literal

from app.auth.dependencies import SESSION_COOKIE_NAME
from dotenv import load_dotenv
from fastapi import Response

load_dotenv()

SESSION_COOKIE_DOMAIN = os.getenv("SESSION_COOKIE_DOMAIN", None)
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() == "true"


def set_session_cookie(
    response: Response,
    token: str,
    expires_at: datetime,
    http_only: bool = True,
    same_site: Literal["lax", "strict", "none"] = "lax",
) -> None:
    """Set a session cookie in the response."""
    now = datetime.now(timezone.utc)
    max_age = int((expires_at - now).total_seconds())

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=max_age,
        expires=expires_at.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        domain=SESSION_COOKIE_DOMAIN,
        path="/",
        secure=SECURE_COOKIES,
        httponly=http_only,
        samesite=same_site,
    )


def clear_session_cookie(response: Response) -> None:
    """Clear the session cookie from the response."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        domain=SESSION_COOKIE_DOMAIN,
        path="/",
    )
