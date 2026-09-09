"""Password authentication for the personal local deployment."""

import os
from typing import Final

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from app.database.crud.user_crud import user as user_crud
from app.database.models import User
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

_PASSWORD_HASHER: Final = PasswordHasher()
_MIN_PASSWORD_LENGTH: Final = 12


def is_local_auth_enabled() -> bool:
    return os.getenv("LOCAL_AUTH_ENABLED", "false").lower() == "true"


def validate_password(password: str) -> None:
    if len(password) < _MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must be at least {_MIN_PASSWORD_LENGTH} characters long."
        )


def hash_password(password: str) -> str:
    validate_password(password)
    return _PASSWORD_HASHER.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    if not password_hash:
        return False
    try:
        valid = _PASSWORD_HASHER.verify(password_hash, password)
    except (InvalidHashError, VerificationError):
        return False
    return bool(valid)


def password_needs_rehash(password_hash: str) -> bool:
    return _PASSWORD_HASHER.check_needs_rehash(password_hash)


def bootstrap_local_user(db: Session) -> User | None:
    if not is_local_auth_enabled():
        return None

    email = os.getenv("LOCAL_AUTH_EMAIL", "").strip().lower()
    password = os.getenv("LOCAL_AUTH_PASSWORD", "")
    name = os.getenv("LOCAL_AUTH_NAME", "Local User").strip() or "Local User"
    if not email or not password:
        return None

    existing_user = user_crud.get_by_email(db, email=email)
    if existing_user:
        if not verify_password(existing_user.password_hash, password):
            user_crud.update_password_hash(
                db,
                user=existing_user,
                password_hash=hash_password(password),
            )
        return existing_user

    try:
        return user_crud.create_local_user(
            db,
            email=email,
            name=name,
            password_hash=hash_password(password),
        )
    except IntegrityError:
        db.rollback()
        existing_user = user_crud.get_by_email(db, email=email)
        if existing_user:
            return existing_user
        raise
