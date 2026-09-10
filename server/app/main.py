import logging
import os

import uvicorn  # type: ignore
from dotenv import load_dotenv

# Load configuration before importing providers.
load_dotenv()

from app.logging_config import configure_logging

configure_logging()

from app.api.api import router
from app.api.attendance_api import attendance_router
from app.api.auth_api import auth_router
from app.api.group_meeting_api import group_meeting_router
from app.api.member_api import member_router
from app.api.notification_api import notification_router, settings_router
from app.api.semester_api import semester_router
from app.api.seminar_api import seminar_router
from app.api.sync_api import sync_router
from app.api.webhook_api import webhook_router
from app.api.weekly_report_api import weekly_report_router
from app.auth.local import bootstrap_local_user
from app.database.database import SessionLocal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger(__name__)

LOCAL_AUTH_ENABLED = os.getenv("LOCAL_AUTH_ENABLED", "false").lower() == "true"


app = FastAPI(
    title="SMC-Web-Agent",
    description="Web application for the SMCLab daily affairs.",
    version="0.1.0",
)

client_domain = os.getenv("CLIENT_DOMAIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[client_domain],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    allow_credentials=True,  # Required for the session cookie
    max_age=600,
)


@app.on_event("startup")
def bootstrap_personal_account() -> None:
    with SessionLocal() as db:
        bootstrap_local_user(db)


app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(member_router, prefix="/api/members")
app.include_router(semester_router, prefix="/api/semesters")
app.include_router(seminar_router, prefix="/api/seminars")
app.include_router(weekly_report_router, prefix="/api/weekly-reports")
app.include_router(notification_router, prefix="/api/notifications")
app.include_router(settings_router, prefix="/api/settings")
app.include_router(sync_router, prefix="/api/sync")
app.include_router(attendance_router, prefix="/api/attendance")
app.include_router(group_meeting_router, prefix="/api/group-meeting")
app.include_router(webhook_router, prefix="/api/webhooks")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        log_level="debug",
        log_config=None,  # Keep the handlers configure_logging() installed
        forwarded_allow_ips="*",
        proxy_headers=True,
    )
