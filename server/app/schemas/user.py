from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


# Current user returned to protected routes and the client.
class CurrentUser(BaseModel):
    id: UUID
    email: EmailStr
    name: Optional[str] = None
    avatar_url: Optional[str] = None

    class ConfigDict:
        from_attributes = True
