from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.database import get_db
from app.models import Asset, AssetCreate, AssetUpdate, AssetOut
from app.auth import get_current_user, require_editor

router = APIRouter()


@router.get("/", response_model=List[AssetOut])
async def list_assets(
    category: Optional[str] = Query(None),
    status:   Optional[str] = Query(None),
    search:   Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(Asset)
    if category:
        q = q.where(Asset.category == category)
    if status:
        q = q.where(Asset.status == status)
    if search:
        term = f"%{search}%"
        q = q.where(or_(
            Asset.name.ilike(term),
            Asset.serial_number.ilike(term),
            Asset.location.ilike(term),
            Asset.notes.ilike(term),
            Asset.accountable_person.ilike(term),
            Asset.accountable_department.ilike(term),
        ))
    result = await db.execute(q.order_by(Asset.created_at.desc()))
    return result.scalars().all()


@router.get("/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("/", response_model=AssetOut, status_code=201)
async def create_asset(payload: AssetCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    now = datetime.now(timezone.utc)
    asset = Asset(asset_id=str(uuid.uuid4()), **payload.model_dump(), created_at=now, updated_at=now)
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.put("/{asset_id}", response_model=AssetOut)
async def update_asset(asset_id: str, payload: AssetUpdate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.delete(asset)
    await db.commit()
