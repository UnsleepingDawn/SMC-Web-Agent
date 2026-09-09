import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/health")
def health_check():
    return JSONResponse(status_code=200, content={"status": "ok"})


@router.get("/info")
def info():
    return JSONResponse(
        status_code=200,
        content={
            "service": "smc-web-agent",
            "version": "0.1.0",
            "public_base_url": os.getenv("PUBLIC_BASE_URL", "http://localhost:3000"),
        },
    )
