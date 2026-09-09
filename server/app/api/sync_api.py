"""Trigger Feishu synchronisation and read task progress."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.auth.dependencies import get_required_user
from app.database.crud.semester_crud import semester as semester_crud
from app.database.crud.sync_crud import (
    SyncRunCreate,
    sync_run as sync_run_crud,
)
from app.database.database import get_db
from app.helpers.feishu_jobs import feishu_jobs
from app.schemas.user import CurrentUser
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

sync_router = APIRouter()

SUPPORTED_TASKS = ("members", "seminars", "weekly_reports")


class SyncRequest(BaseModel):
    task: str
    semester_id: Optional[str] = None
    week: Optional[int] = None


def _resolve_semester(db: Session, semester_id: Optional[str]):
    if not semester_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="请先选择学期"
        )
    try:
        parsed_id = UUID(semester_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="学期 ID 不合法")

    db_semester = semester_crud.get(db, id=parsed_id)
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到学期")
    return db_semester


@sync_router.post("")
def start_sync(
    payload: SyncRequest,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    if payload.task not in SUPPORTED_TASKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的任务类型 {payload.task}",
        )

    db_semester = _resolve_semester(db, payload.semester_id)

    if payload.task == "members" and not (
        db_semester.seminar_app_token and db_semester.seminar_table_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先在设置里填写组会多维表格的 app_token 与 table_id",
        )
    if payload.task == "seminars" and not (
        db_semester.seminar_app_token and db_semester.seminar_table_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请先在设置里填写组会多维表格的 app_token 与 table_id",
        )
    if payload.task == "weekly_reports":
        if not (db_semester.weekly_report_app_token and db_semester.weekly_report_table_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请先在设置里填写周报多维表格的 app_token 与 table_id",
            )
        if not payload.week:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="同步周报需要指定周次"
            )

    run = sync_run_crud.create(
        db,
        obj_in=SyncRunCreate(
            task_name=payload.task,
            semester_id=db_semester.id,
            week=payload.week,
            payload={
                "semester_name": db_semester.name,
                "week": payload.week,
            },
        ),
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="创建同步记录失败"
        )

    if payload.task == "members":
        job_id = feishu_jobs.sync_members(
            run_id=run.id,
            seminar_app_token=db_semester.seminar_app_token,
            seminar_table_id=db_semester.seminar_table_id,
        )
    elif payload.task == "seminars":
        job_id = feishu_jobs.sync_seminar(
            run_id=run.id,
            seminar_app_token=db_semester.seminar_app_token,
            seminar_table_id=db_semester.seminar_table_id,
            semester_start=db_semester.start_date.isoformat(),
            default_weekday=db_semester.default_seminar_weekday,
        )
    else:
        job_id = feishu_jobs.sync_weekly_reports(
            run_id=run.id,
            weekly_report_app_token=db_semester.weekly_report_app_token,
            weekly_report_table_id=db_semester.weekly_report_table_id,
            week=payload.week,
        )

    sync_run_crud.mark_running(db, run=run, job_id=job_id)
    return {"run_id": str(run.id), "job_id": job_id, "status": "running"}


@sync_router.get("/runs")
def list_sync_runs(
    limit: int = 20,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    rows = sync_run_crud.list_recent(db, limit=min(limit, 100))
    return {"runs": [row.to_dict() for row in rows]}


@sync_router.get("/runs/{run_id}")
def get_sync_run(
    run_id: str,
    current_user: CurrentUser = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    try:
        parsed_id = UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务 ID 不合法")

    run = sync_run_crud.get(db, id=parsed_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="未找到该同步任务")
    return {"run": run.to_dict()}
