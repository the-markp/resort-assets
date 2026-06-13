import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.database import get_db
from app.models import AppSetting
from app.auth import get_current_user, require_admin

router = APIRouter()

LOGO_DIR  = "frontend/static/uploads"
LOGO_KEY  = "logo_path"
ALLOWED   = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
MAX_BYTES = 2 * 1024 * 1024   # 2 MB


@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(AppSetting))
    rows   = result.scalars().all()
    return {r.key: r.value for r in rows}


@router.post("/logo")
async def upload_logo(
    file: UploadFile = File(...),
    db:   AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"File type not allowed. Use: {', '.join(ALLOWED)}")

    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 2 MB.")

    os.makedirs(LOGO_DIR, exist_ok=True)

    # Remove old logo files before saving new one
    for old in os.listdir(LOGO_DIR):
        if old.startswith("logo."):
            os.remove(os.path.join(LOGO_DIR, old))

    dest = os.path.join(LOGO_DIR, f"logo{ext}")
    with open(dest, "wb") as f:
        f.write(contents)

    logo_url = f"/static/uploads/logo{ext}"
    now      = datetime.now(timezone.utc)

    row = await db.get(AppSetting, LOGO_KEY)
    if row:
        row.value      = logo_url
        row.updated_at = now
    else:
        db.add(AppSetting(key=LOGO_KEY, value=logo_url, updated_at=now))

    await db.commit()
    return {"logo_url": logo_url}


@router.delete("/logo", status_code=204)
async def delete_logo(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    row = await db.get(AppSetting, LOGO_KEY)
    if row:
        if row.value:
            path = "frontend/static" + row.value.replace("/static", "")
            if os.path.exists(path):
                os.remove(path)
        await db.delete(row)
        await db.commit()
