"""FastAPI status API for the Celery workers."""

import logging
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from src.celery_app import celery_app
from src.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SMC-Web-Agent Jobs",
    description="Celery-based Feishu synchronisation service",
    version="0.1.0",
)


class TaskStatus(BaseModel):
    task_id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    meta: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    progress_message: Optional[str] = None


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "smc-jobs"}


@app.get("/task/{task_id}/status", response_model=TaskStatus)
async def get_task_status(task_id: str):
    try:
        task_result = celery_app.AsyncResult(task_id)

        if task_result.state == "PENDING":
            return TaskStatus(
                task_id=task_id,
                status="pending",
                meta={"message": "Task is pending or does not exist"},
            )
        if task_result.state == "PROGRESS":
            progress_info = task_result.info or {}
            return TaskStatus(
                task_id=task_id,
                status="running",
                meta=progress_info,
                progress_message=progress_info.get("status", "Processing..."),
            )
        if task_result.state == "SUCCESS":
            return TaskStatus(
                task_id=task_id,
                status="completed",
                result=task_result.result,
                meta={"completed_at": str(task_result.date_done)},
            )
        if task_result.state == "FAILURE":
            return TaskStatus(
                task_id=task_id,
                status="failed",
                error=str(task_result.info),
                meta={"failed_at": str(task_result.date_done)},
            )
        return TaskStatus(
            task_id=task_id,
            status=task_result.state.lower(),
            meta={"info": str(task_result.info)},
        )
    except Exception as e:
        logger.error(f"Failed to get task status for {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get task status: {str(e)}")


@app.delete("/task/{task_id}")
async def cancel_task(task_id: str):
    try:
        celery_app.control.revoke(task_id, terminate=True)
        logger.info(f"Cancelled task {task_id}")
        return {"message": f"Task {task_id} has been cancelled"}
    except Exception as e:
        logger.error(f"Failed to cancel task {task_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel task: {str(e)}")


@app.get("/worker/status")
async def get_worker_status():
    try:
        inspect = celery_app.control.inspect()
        return {
            "active_tasks": inspect.active(),
            "registered_tasks": inspect.registered(),
            "worker_stats": inspect.stats(),
        }
    except Exception as e:
        logger.error(f"Failed to get worker status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get worker status: {str(e)}")
