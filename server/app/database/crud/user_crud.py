import datetime
import logging
import secrets
import uuid
from typing import Optional
from uuid import UUID

from app.database.crud.base_crud import CRUDBase
from app.database.models import Session as DBSession
from app.database.models import User
from app.schemas.user import UserUpdate
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class CRUDUser(CRUDBase[User, UserUpdate, UserUpdate]):
    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        """Get a user by email."""
        return db.query(User).filter(User.email == email).first()

    def create_session(
        self,
        db: Session,
        *,
        user_id: UUID,
        user_agent: Optional[str] = None,
        ip_address: Optional[str] = None,
        expires_in_days: int = 30,
    ) -> DBSession:
        """Create a new session for a user."""
        token = secrets.token_hex(32)
        expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            days=expires_in_days
        )

        session = DBSession(
            id=uuid.uuid4(),
            user_id=user_id,
            token=token,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )

        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def get_by_token(self, db: Session, *, token: str) -> Optional[DBSession]:
        """Get session by token."""
        now = datetime.datetime.now(datetime.timezone.utc)
        session = (
            db.query(DBSession)
            .filter(DBSession.token == token, DBSession.expires_at > now)
            .first()
        )
        return session

    def revoke_session(self, db: Session, *, token: str) -> bool:
        """Revoke (delete) a session."""
        session = db.query(DBSession).filter(DBSession.token == token).first()
        if session:
            db.delete(session)
            db.commit()
            return True
        return False

    def revoke_all_sessions(self, db: Session, *, user_id: UUID) -> int:
        """Revoke all sessions for a user."""
        result = db.query(DBSession).filter(DBSession.user_id == user_id).delete()
        db.commit()
        return result

    def create_local_user(
        self, db: Session, *, email: str, name: str, password_hash: str
    ) -> User:
        db_obj = User(
            email=email,
            name=name,
            password_hash=password_hash,
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update_password_hash(
        self, db: Session, *, user: User, password_hash: str
    ) -> User:
        user.password_hash = password_hash  # type: ignore
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


user = CRUDUser(User)
