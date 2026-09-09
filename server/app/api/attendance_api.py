"""Placeholder routers for the modules that come later.

Attendance statistics and BILP group-meeting scheduling need the Feishu
attendance API and a clarified business rule respectively; the endpoints exist
so the client can wire navigation now and get a clear answer instead of a 404.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_required_user
from app.schemas.user import CurrentUser

attendance_router = APIRouter()
group_meeting_router = APIRouter()

_NOT_IMPLEMENTED = (
    "该功能尚未实现。考勤统计需要飞书考勤接口权限，小组会议排班需要先确认 BILP 约束，"
    "两者都在后续版本落地。"
)


@attendance_router.api_route("", methods=["GET", "POST"])
def attendance_placeholder(current_user: CurrentUser = Depends(get_required_user)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED
    )


@group_meeting_router.api_route("", methods=["GET", "POST"])
def group_meeting_placeholder(current_user: CurrentUser = Depends(get_required_user)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=_NOT_IMPLEMENTED
    )
