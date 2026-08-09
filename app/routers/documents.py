import os
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.database import get_db
from app.models import PolicyDocument, PolicyDocumentOut
from app.auth import get_current_user, require_admin

router = APIRouter()

DOCS_DIR   = "frontend/static/uploads/documents"
MAX_BYTES  = 20 * 1024 * 1024   # 20 MB per document
ALLOWED    = {".pdf"}


@router.get("/", response_model=List[PolicyDocumentOut])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(select(PolicyDocument).order_by(PolicyDocument.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=PolicyDocumentOut, status_code=201)
async def upload_document(
    name:        str        = Form(...),
    description: str        = Form(""),
    file:        UploadFile = File(...),
    db:          AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")

    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 20 MB.")

    os.makedirs(DOCS_DIR, exist_ok=True)

    doc_id    = str(uuid.uuid4())
    safe_name = f"{doc_id}{ext}"
    dest      = os.path.join(DOCS_DIR, safe_name)

    with open(dest, "wb") as f:
        f.write(contents)

    now = datetime.now(timezone.utc)
    doc = PolicyDocument(
        doc_id        = doc_id,
        name          = name.strip(),
        description   = description.strip() or None,
        filename      = file.filename,
        file_path     = dest,
        file_size     = len(contents),
        uploaded_by   = current_user.user_id,
        uploader_name = current_user.full_name or current_user.username,
        created_at    = now,
        updated_at    = now,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    doc = await db.get(PolicyDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    return FileResponse(
        path         = doc.file_path,
        filename     = doc.filename,
        media_type   = "application/pdf",
        headers      = {"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.delete("/{doc_id}", status_code=204)
async def delete_document(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    doc = await db.get(PolicyDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove file from disk
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    await db.delete(doc)
    await db.commit()
