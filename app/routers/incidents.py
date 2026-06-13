from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.database import get_db
from app.models import (Incident, IncidentComment, Asset,
                         IncidentCreate, IncidentUpdate, CommentCreate,
                         IncidentOut, CommentOut)
from app.auth import get_current_user, require_editor

router = APIRouter()


def _incident_to_out(incident, comments) -> IncidentOut:
    obj = IncidentOut.model_validate(incident)
    obj.comments = [CommentOut.model_validate(c) for c in comments]
    return obj


@router.get("/", response_model=List[IncidentOut])
async def list_incidents(
    status:   Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(Incident)
    if status:   q = q.where(Incident.status == status)
    if severity: q = q.where(Incident.severity == severity)
    if asset_id: q = q.where(Incident.asset_id == asset_id)
    q = q.order_by(Incident.created_at.desc())
    result   = await db.execute(q)
    incidents = result.scalars().all()

    out = []
    for inc in incidents:
        cr = await db.execute(
            select(IncidentComment)
            .where(IncidentComment.incident_id == inc.incident_id)
            .order_by(IncidentComment.created_at)
        )
        out.append(_incident_to_out(inc, cr.scalars().all()))
    return out


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    cr = await db.execute(
        select(IncidentComment)
        .where(IncidentComment.incident_id == incident_id)
        .order_by(IncidentComment.created_at)
    )
    return _incident_to_out(inc, cr.scalars().all())


@router.post("/", response_model=IncidentOut, status_code=201)
async def create_incident(
    payload: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    now        = datetime.now(timezone.utc)
    asset_name = None
    if payload.asset_id:
        asset = await db.get(Asset, payload.asset_id)
        if asset:
            asset_name = asset.name

    inc = Incident(
        incident_id   = str(uuid.uuid4()),
        asset_id      = payload.asset_id,
        asset_name    = asset_name,
        title         = payload.title,
        description   = payload.description,
        severity      = payload.severity,
        status        = "open",
        reported_by   = current_user.user_id,
        reporter_name = current_user.full_name or current_user.username,
        created_at    = now,
        updated_at    = now,
    )
    db.add(inc)
    await db.commit()
    await db.refresh(inc)
    return _incident_to_out(inc, [])


@router.put("/{incident_id}", response_model=IncidentOut)
async def update_incident(
    incident_id: str,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_editor),
):
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    if inc.status == "closed" and payload.status != "open":
        raise HTTPException(status_code=400, detail="Closed incidents can only be reopened")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(inc, field, value)
    inc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inc)

    cr = await db.execute(
        select(IncidentComment)
        .where(IncidentComment.incident_id == incident_id)
        .order_by(IncidentComment.created_at)
    )
    return _incident_to_out(inc, cr.scalars().all())


@router.post("/{incident_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    incident_id: str,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    now     = datetime.now(timezone.utc)
    comment = IncidentComment(
        comment_id  = str(uuid.uuid4()),
        incident_id = incident_id,
        author_id   = current_user.user_id,
        author_name = current_user.full_name or current_user.username,
        body        = payload.body,
        created_at  = now,
    )
    db.add(comment)
    inc.updated_at = now
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/{incident_id}", status_code=204)
async def delete_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_editor),
):
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    await db.delete(inc)
    await db.commit()
