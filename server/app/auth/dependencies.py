import logging
import uuid
from typing import Annotated, Optional

from app.database.crud.user_crud import user as user_crud
from app.database.database import get_db
from app.schemas.user import CurrentUser
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "session_token"

api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str = Depends(api_key_header),
) -> Optional[CurrentUser]:
    """Get the current user from the session token in a cookie or header."""
    token = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")

    if not token:
        token = request.cookies.get(SESSION_COOKIE_NAME)

    if not token:
        return None

    db_session = user_crud.get_by_token(db=db, token=token)
    if not db_session:
        return None

    db_user = user_crud.get(db=db, id=db_session.user_id)
    if not db_user:
        return None

    if not db_user.id:
        logger.error("User ID is missing in the database record.")
        return None

    id_as_uuid = uuid.UUID(str(db_user.id))

    return CurrentUser(
        id=id_as_uuid,
        email=str(db_user.email),
        name=db_user.name,  # type: ignore
        avatar_url=db_user.avatar_url,
    )


async def get_required_user(
    current_user: Annotated[Optional[CurrentUser], Depends(get_current_user)]
) -> CurrentUser:
    """Require a logged-in user for protected routes."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user
