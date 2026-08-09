from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from datetime import datetime, timezone
import uuid

import csv
import io
from datetime import datetime as dt
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



SEVERITY_LABELS   = {"low": "Low", "medium": "Medium", "high": "High", "critical": "Critical"}
INC_STATUS_LABELS = {"open": "Open", "in_progress": "In Progress", "resolved": "Resolved", "closed": "Closed"}


@router.get("/export/csv")
async def export_incidents_csv(
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

    result    = await db.execute(q)
    incidents = result.scalars().all()

    # Fetch all comments in one query and group by incident_id
    all_comments_result = await db.execute(
        select(IncidentComment)
        .where(IncidentComment.incident_id.in_([i.incident_id for i in incidents]))
        .order_by(IncidentComment.created_at)
    )
    comments_by_incident = {}
    for c in all_comments_result.scalars().all():
        comments_by_incident.setdefault(c.incident_id, []).append(c)

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Incident ID", "Title", "Severity", "Status",
        "Related Asset", "Description",
        "Reported By", "Assigned To", "Resolution",
        "Comment Count", "Comments",
        "Created At", "Updated At",
    ])

    for inc in incidents:
        comments = comments_by_incident.get(inc.incident_id, [])
        comments_text = " | ".join(
            f"[{c.author_name or 'User'} @ {c.created_at.strftime('%Y-%m-%d %H:%M')}]: {c.body}"
            for c in comments
        )
        writer.writerow([
            inc.incident_id,
            inc.title,
            SEVERITY_LABELS.get(inc.severity, inc.severity),
            INC_STATUS_LABELS.get(inc.status, inc.status),
            inc.asset_name or "",
            inc.description,
            inc.reporter_name or "",
            inc.assigned_to or "",
            inc.resolution or "",
            len(comments),
            comments_text,
            inc.created_at.isoformat() if inc.created_at else "",
            inc.updated_at.isoformat() if inc.updated_at else "",
        ])

    output.seek(0)
    filename = f"gtracker_incidents_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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
