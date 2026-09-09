import logging
import uuid
from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Deque, Optional

from app.auth.dependencies import get_current_user, get_required_user
from app.auth.local import (
    hash_password,
    is_local_auth_enabled,
    password_needs_rehash,
    verify_password,
)
from app.auth.utils import clear_session_cookie, set_session_cookie
from app.database.crud.user_crud import user as user_crud
from app.database.database import get_db
from app.database.models import User
from app.schemas.user import CurrentUser, UserUpdate
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

auth_router = APIRouter()

_LOGIN_FAILURE_WINDOW_SECONDS = 10 * 60
_LOGIN_FAILURE_LIMIT = 5
_login_failures: dict[str, Deque[float]] = defaultdict(deque)
_login_failure_lock = Lock()


class AuthResponse(BaseModel):
    """Response model for auth routes."""

    success: bool
    message: str
    user: Optional[CurrentUser] = None


class ProfileUpdateRequest(BaseModel):
    """Request model for profile update."""

    name: str


class LocalLoginRequest(BaseModel):
    email: str
    password: str


class LocalPasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


def _check_login_rate_limit(client_host: str) -> bool:
    now = monotonic()
    with _login_failure_lock:
        attempts = _login_failures[client_host]
        while attempts and now - attempts[0] >= _LOGIN_FAILURE_WINDOW_SECONDS:
            attempts.popleft()
        return len(attempts) < _LOGIN_FAILURE_LIMIT


def _record_login_failure(client_host: str) -> None:
    with _login_failure_lock:
        _login_failures[client_host].append(monotonic())


def _clear_login_failures(client_host: str) -> None:
    with _login_failure_lock:
        _login_failures.pop(client_host, None)


def _current_user_from_db(db_user: User) -> CurrentUser:
    return CurrentUser(
        id=uuid.UUID(str(db_user.id)),
        email=str(db_user.email),
        name=str(db_user.name) if db_user.name else None,
        avatar_url=db_user.avatar_url,
    )


@auth_router.post("/local/login", response_model=AuthResponse)
async def local_login(
    credentials: LocalLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not is_local_auth_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    client_host = request.client.host if request.client else "unknown"
    if not _check_login_rate_limit(client_host):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Try again later.",
        )

    email = credentials.email.lower().strip()
    db_user = user_crud.get_by_email(db, email=email)
    if not db_user or not verify_password(db_user.password_hash, credentials.password):
        _record_login_failure(client_host)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if password_needs_rehash(db_user.password_hash):
        user_crud.update_password_hash(
            db, user=db_user, password_hash=hash_password(credentials.password)
        )

    _clear_login_failures(client_host)
    session = user_crud.create_session(
        db=db,
        user_id=db_user.id,
        user_agent=request.headers.get("user-agent"),
        ip_address=client_host,
    )
    response = JSONResponse(
        AuthResponse(
            success=True,
            message="Signed in successfully.",
            user=_current_user_from_db(db_user),
        ).model_dump(mode="json")
    )
    set_session_cookie(response, token=session.token, expires_at=session.expires_at)
    return response


@auth_router.post("/local/password", response_model=AuthResponse)
async def change_local_password(
    password_change: LocalPasswordChangeRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    if not is_local_auth_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    db_user = user_crud.get(db=db, id=current_user.id)
    if not db_user or not verify_password(
        db_user.password_hash, password_change.current_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )

    try:
        new_password_hash = hash_password(password_change.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    user_crud.update_password_hash(db, user=db_user, password_hash=new_password_hash)
    user_crud.revoke_all_sessions(db=db, user_id=current_user.id)
    session = user_crud.create_session(
        db=db,
        user_id=current_user.id,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    response = JSONResponse(
        AuthResponse(
            success=True,
            message="Password changed successfully.",
            user=_current_user_from_db(db_user),
        ).model_dump(mode="json")
    )
    set_session_cookie(response, token=session.token, expires_at=session.expires_at)
    return response


@auth_router.get("/me", response_model=AuthResponse)
async def get_me(
    current_user: Optional[CurrentUser] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user."""
    if not current_user:
        return AuthResponse(success=False, message="Not authenticated")

    return AuthResponse(success=True, message="User found", user=current_user)


@auth_router.patch("/profile", response_model=AuthResponse)
async def update_profile(
    request: ProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile."""
    name = request.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name cannot be empty",
        )

    db_user = user_crud.get(db=db, id=current_user.id)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user_crud.update(db=db, db_obj=db_user, obj_in=UserUpdate(name=name))
    db.refresh(db_user)

    updated_current_user = CurrentUser(
        id=uuid.UUID(str(db_user.id)),
        email=str(db_user.email),
        name=str(db_user.name) if db_user.name else None,
        avatar_url=db_user.avatar_url,
    )

    return AuthResponse(
        success=True,
        message="Profile updated successfully",
        user=updated_current_user,
    )


@auth_router.get("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Logout the current user."""
    token = request.cookies.get("session_token")
    if token:
        user_crud.revoke_session(db=db, token=token)

    clear_session_cookie(response)

    return AuthResponse(success=True, message="Logged out successfully")
