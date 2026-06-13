import csv
import io
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.database import get_db
from app.models import Asset, AssetCreate, AssetUpdate, AssetOut, asset_to_out, compute_book_value
from app.auth import get_current_user, require_editor

router = APIRouter()

CATEGORY_LABELS = {
    "rooms_facilities":      "Rooms & Facilities",
    "furniture_equipment":   "Furniture & Equipment",
    "vehicles_transport":    "Vehicles & Transport",
    "it_electronics":        "IT & Electronics",
    "maintenance_tools":     "Maintenance Tools",
    "inventory_consumables": "Inventory & Consumables",
}

STATUS_LABELS = {
    "available":   "Available",
    "in_use":      "In Use",
    "maintenance": "Under Maintenance",
    "retired":     "Retired",
    "lost":        "Lost",
}

DEPRECIATION_LABELS = {
    "straight_line":     "Straight Line",
    "declining_balance": "Declining Balance (2x)",
    "custom_rate":       "Custom Rate",
    "none":              "None",
}


def _build_query(category, status, search):
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
    return q.order_by(Asset.created_at.desc())


@router.get("/export/csv")
async def export_assets_csv(
    category: Optional[str] = Query(None),
    status:   Optional[str] = Query(None),
    search:   Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(_build_query(category, status, search))
    assets = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Asset ID", "Name", "Category", "Status",
        "Location", "Serial Number",
        "Accountable Department", "Accountable Person",
        "Purchase Date", "Purchase Value (PHP)",
        "Service Life (Years)", "Depreciation Method", "Depreciation Rate (%)",
        "Repair Cost (PHP)", "Book Value (PHP)",
        "Notes", "Created At", "Updated At",
    ])

    for a in assets:
        bv = compute_book_value(a)
        writer.writerow([
            a.asset_id,
            a.name,
            CATEGORY_LABELS.get(a.category, a.category),
            STATUS_LABELS.get(a.status, a.status),
            a.location or "",
            a.serial_number or "",
            a.accountable_department or "",
            a.accountable_person or "",
            a.purchase_date or "",
            a.purchase_value or "",
            a.service_life_years or "",
            DEPRECIATION_LABELS.get(a.depreciation_method, a.depreciation_method or ""),
            float(a.depreciation_rate) if a.depreciation_rate else "",
            float(a.repair_cost) if a.repair_cost else "",
            bv if bv is not None else "",
            a.notes or "",
            a.created_at.isoformat() if a.created_at else "",
            a.updated_at.isoformat() if a.updated_at else "",
        ])

    output.seek(0)
    filename = f"gtracker_assets_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/", response_model=List[AssetOut])
async def list_assets(
    category: Optional[str] = Query(None),
    status:   Optional[str] = Query(None),
    search:   Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(_build_query(category, status, search))
    return [asset_to_out(a) for a in result.scalars().all()]


@router.get("/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    a = await db.get(Asset, asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset_to_out(a)


@router.post("/", response_model=AssetOut, status_code=201)
async def create_asset(payload: AssetCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    now   = datetime.now(timezone.utc)
    asset = Asset(asset_id=str(uuid.uuid4()), **payload.model_dump(), created_at=now, updated_at=now)
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset_to_out(asset)


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
    return asset_to_out(asset)


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.delete(asset)
    await db.commit()
