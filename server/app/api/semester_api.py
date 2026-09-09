"""Semester CRUD and the current-week lookup."""

from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from app.auth.dependencies import get_required_user
from app.database.crud.semester_crud import (
    SemesterCreate,
    SemesterUpdate,
    semester as semester_crud,
)
from app.database.database import get_db
from app.helpers.semester_calendar import week_period
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

semester_router = APIRouter()


def _semester_payload(db_semester, current_week: Optional[int] = None) -> dict:
    payload = db_semester.to_dict()
    if current_week is not None:
        payload["current_week"] = current_week
        monday, friday = week_period(db_semester.start_date, current_week)
        payload["week_start"] = monday.isoformat()
        payload["week_end"] = friday.isoformat()
    return payload


@semester_router.get("")
def list_semesters(
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = semester_crud.list_ordered(db)
    return {"semesters": [_semester_payload(row) for row in rows]}


@semester_router.get("/current")
def current_semester(
    on: Optional[date] = None,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = semester_crud.get_current(db, on)
    if not db_semester:
        return {"semester": None, "current_week": None}
    week = semester_crud.current_week(db, on)
    return {"semester": _semester_payload(db_semester, week), "current_week": week}


@semester_router.post("")
def create_semester(
    payload: SemesterCreate,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    existing = semester_crud.get_by(db, name=payload.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="已存在同名学期"
        )
    created = semester_crud.create(db, obj_in=payload)
    if not created:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="创建学期失败")
    return {"semester": _semester_payload(created)}


@semester_router.patch("/{semester_id}")
def update_semester(
    semester_id: str,
    payload: SemesterUpdate,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = semester_crud.get(db, id=semester_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该学期")
    updated = semester_crud.update(db=db, db_obj=db_semester, obj_in=payload)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="更新学期失败")
    return {"semester": _semester_payload(updated)}


@semester_router.delete("/{semester_id}")
def delete_semester(
    semester_id: str,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    db_semester = semester_crud.get(db, id=semester_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该学期")
    semester_crud.remove(db, id=semester_id)
    return {"message": "已删除该学期及其组会与周报记录"}
