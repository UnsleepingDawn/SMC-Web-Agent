"""Member master data: list, edit, export the signature sheet."""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Optional

from app.auth.dependencies import get_required_user
from app.database.crud.member_crud import MemberUpdate, member as member_crud
from app.database.database import get_db
from app.helpers.s3 import s3_service
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, Query, status
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

member_router = APIRouter()


class MemberRow(BaseModel):
    id: str
    name: str
    grade: Optional[str] = None
    advisor: Optional[str] = None
    advisor_user_id: Optional[str] = None
    cultivation_type: Optional[str] = None
    enrollment_status: Optional[str] = None
    feishu_account: Optional[str] = None
    student_id: Optional[str] = None
    union_id: Optional[str] = None
    feishu_user_id: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    need_attendance: bool
    is_active: bool


@member_router.get("")
def list_members(
    search: Optional[str] = Query(None),
    advisor: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    enrollment_status: Optional[str] = Query(None),
    need_attendance: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = member_crud.list_filtered(
        db,
        search=search,
        advisor=advisor,
        grade=grade,
        enrollment_status=enrollment_status,
        need_attendance=need_attendance,
        is_active=is_active,
    )
    return {"members": [row.to_dict() for row in rows]}


@member_router.get("/filters")
def member_filters(
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    return {
        "advisors": member_crud.distinct_values(db, "advisor"),
        "grades": member_crud.distinct_values(db, "grade"),
        "enrollment_statuses": member_crud.distinct_values(db, "enrollment_status"),
    }


@member_router.patch("/{member_id}")
def update_member(
    member_id: str,
    payload: MemberUpdate,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_member = member_crud.get(db, id=member_id)
    if not db_member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该成员")

    updated = member_crud.update(db=db, db_obj=db_member, obj_in=payload)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="更新成员失败")
    return {"member": updated.to_dict()}


@member_router.post("/export/signature-sheet")
def export_signature_sheet(
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    """Generate the attendance signature sheet and return a download URL."""
    rows = member_crud.list_need_attendance(db)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="还没有标记需要考勤的成员，请先在人员管理里勾选",
        )

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "SMC 在校签名表"
    headers = ["序号", "姓名", "年级", "导师", "培养类型", "签名"]
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")

    for index, row in enumerate(rows, start=1):
        sheet.append(
            [
                index,
                row.name,
                row.grade or "",
                row.advisor or "",
                row.cultivation_type or "",
                "",
            ]
        )

    sheet.column_dimensions["A"].width = 6
    sheet.column_dimensions["B"].width = 12
    sheet.column_dimensions["C"].width = 10
    sheet.column_dimensions["D"].width = 14
    sheet.column_dimensions["E"].width = 14
    sheet.column_dimensions["F"].width = 20

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)

    object_key = "exports/signature-sheet.xlsx"
    _, file_url = s3_service.upload_bytes(
        buffer,
        object_key,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    return {"file_url": file_url, "count": len(rows)}
