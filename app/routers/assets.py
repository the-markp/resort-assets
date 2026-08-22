import csv
import io
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from app.database import get_db
from app.models import Asset, User, AssetCreate, AssetUpdate, AssetOut, asset_to_out, compute_book_value
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


async def _get_users_map(db: AsyncSession) -> dict:
    """Return {user_id: User} for resolving responsible user names."""
    result = await db.execute(select(User))
    return {u.user_id: u for u in result.scalars().all()}


async def _generate_asset_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(Asset))
    count  = result.scalar() or 0
    candidate = f"AST-{count + 1:05d}"
    while True:
        existing = await db.execute(
            select(Asset.asset_id).where(Asset.asset_number == candidate)
        )
        if not existing.scalar():
            return candidate
        count += 1
        candidate = f"AST-{count + 1:05d}"


def _build_query(
    category, status, search,
    asset_number, name, location, serial_number,
    accountable_department, accountable_person,
    responsible_user_id, confirmed,
):
    q = select(Asset)
    if category:            q = q.where(Asset.category == category)
    if status:              q = q.where(Asset.status == status)
    if responsible_user_id: q = q.where(Asset.responsible_user_id == responsible_user_id)
    if confirmed is not None:
        q = q.where(Asset.confirmed == confirmed)
    if search:
        term = f"%{search}%"
        q = q.where(or_(
            Asset.name.ilike(term),
            Asset.asset_number.ilike(term),
            Asset.serial_number.ilike(term),
            Asset.location.ilike(term),
            Asset.notes.ilike(term),
            Asset.accountable_person.ilike(term),
            Asset.accountable_department.ilike(term),
        ))
    if asset_number:           q = q.where(Asset.asset_number.ilike(f"%{asset_number}%"))
    if name:                   q = q.where(Asset.name.ilike(f"%{name}%"))
    if location:               q = q.where(Asset.location.ilike(f"%{location}%"))
    if serial_number:          q = q.where(Asset.serial_number.ilike(f"%{serial_number}%"))
    if accountable_department: q = q.where(Asset.accountable_department.ilike(f"%{accountable_department}%"))
    if accountable_person:     q = q.where(Asset.accountable_person.ilike(f"%{accountable_person}%"))
    return q.order_by(Asset.asset_number, Asset.created_at.desc())


@router.get("/export/csv")
async def export_assets_csv(
    category:               Optional[str]  = Query(None),
    status:                 Optional[str]  = Query(None),
    search:                 Optional[str]  = Query(None),
    asset_number:           Optional[str]  = Query(None),
    name:                   Optional[str]  = Query(None),
    location:               Optional[str]  = Query(None),
    serial_number:          Optional[str]  = Query(None),
    accountable_department: Optional[str]  = Query(None),
    accountable_person:     Optional[str]  = Query(None),
    responsible_user_id:    Optional[str]  = Query(None),
    confirmed:              Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(_build_query(
        category, status, search,
        asset_number, name, location, serial_number,
        accountable_department, accountable_person,
        responsible_user_id, confirmed,
    ))
    assets    = result.scalars().all()
    users_map = await _get_users_map(db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Asset Number", "Asset ID", "Name", "Category", "Status",
        "Location", "Serial Number",
        "Accountable Department", "Accountable Person",
        "Responsible User", "Confirmed",
        "Purchase Date", "Purchase Value (PHP)",
        "Service Life (Years)", "Depreciation Method", "Depreciation Rate (%)",
        "Repair Cost (PHP)", "Book Value (PHP)",
        "Notes", "Created At", "Updated At",
    ])
    for a in assets:
        bv = compute_book_value(a)
        ru = users_map.get(a.responsible_user_id)
        writer.writerow([
            a.asset_number or "",
            a.asset_id,
            a.name,
            CATEGORY_LABELS.get(a.category, a.category),
            STATUS_LABELS.get(a.status, a.status),
            a.location or "",
            a.serial_number or "",
            a.accountable_department or "",
            a.accountable_person or "",
            (ru.full_name or ru.username) if ru else "",
            "Yes" if a.confirmed else "No",
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
    category:               Optional[str]  = Query(None),
    status:                 Optional[str]  = Query(None),
    search:                 Optional[str]  = Query(None),
    asset_number:           Optional[str]  = Query(None),
    name:                   Optional[str]  = Query(None),
    location:               Optional[str]  = Query(None),
    serial_number:          Optional[str]  = Query(None),
    accountable_department: Optional[str]  = Query(None),
    accountable_person:     Optional[str]  = Query(None),
    responsible_user_id:    Optional[str]  = Query(None),
    confirmed:              Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result    = await db.execute(_build_query(
        category, status, search,
        asset_number, name, location, serial_number,
        accountable_department, accountable_person,
        responsible_user_id, confirmed,
    ))
    users_map = await _get_users_map(db)
    return [asset_to_out(a, users_map) for a in result.scalars().all()]


@router.get("/{asset_id}", response_model=AssetOut)
async def get_asset(asset_id: str, db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    a = await db.get(Asset, asset_id)
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    users_map = await _get_users_map(db)
    return asset_to_out(a, users_map)


@router.post("/", response_model=AssetOut, status_code=201)
async def create_asset(payload: AssetCreate, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    now  = datetime.now(timezone.utc)
    data = payload.model_dump()

    if not data.get("asset_number"):
        data["asset_number"] = await _generate_asset_number(db)
    else:
        existing = await db.execute(
            select(Asset.asset_id).where(Asset.asset_number == data["asset_number"])
        )
        if existing.scalar():
            raise HTTPException(status_code=409, detail=f"Asset number '{data['asset_number']}' already exists")

    # Validate responsible_user_id if provided
    if data.get("responsible_user_id"):
        user = await db.get(User, data["responsible_user_id"])
        if not user:
            raise HTTPException(status_code=404, detail="Responsible user not found")
        # Snapshot the name into accountable_person if not already set
        if not data.get("accountable_person"):
            data["accountable_person"] = user.full_name or user.username

    data.setdefault("confirmed", False)
    asset = Asset(asset_id=str(uuid.uuid4()), **data, created_at=now, updated_at=now)
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    users_map = await _get_users_map(db)
    return asset_to_out(asset, users_map)


@router.put("/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: str,
    payload:  AssetUpdate,
    db:       AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    updates = payload.model_dump(exclude_none=True)

    # Editors/admins can update everything except confirmed
    # Confirmed can only be changed via the /confirm endpoint
    updates.pop("confirmed", None)

    if "asset_number" in updates and updates["asset_number"] != asset.asset_number:
        existing = await db.execute(
            select(Asset.asset_id).where(
                Asset.asset_number == updates["asset_number"],
                Asset.asset_id    != asset_id,
            )
        )
        if existing.scalar():
            raise HTTPException(status_code=409, detail=f"Asset number '{updates['asset_number']}' already exists")

    # If responsible_user_id is being updated, validate and snapshot name
    if "responsible_user_id" in updates:
        if updates["responsible_user_id"]:
            user = await db.get(User, updates["responsible_user_id"])
            if not user:
                raise HTTPException(status_code=404, detail="Responsible user not found")
            # Auto-fill accountable_person snapshot if not explicitly provided
            if "accountable_person" not in updates:
                updates["accountable_person"] = user.full_name or user.username
        # When responsible_user_id changes, reset confirmed status
        if updates["responsible_user_id"] != asset.responsible_user_id:
            asset.confirmed = False

    for field, value in updates.items():
        setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(asset)
    users_map = await _get_users_map(db)
    return asset_to_out(asset, users_map)


@router.patch("/{asset_id}/confirm", response_model=AssetOut)
async def confirm_asset(
    asset_id:    str,
    db:          AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Toggle the confirmed status of an asset.
    Only callable by the user assigned as responsible_user_id.
    Admins can also confirm/unconfirm on behalf of a user.
    """
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if not asset.responsible_user_id:
        raise HTTPException(status_code=400, detail="No responsible user assigned to this asset")

    # Only the responsible user or an admin can toggle
    is_responsible = current_user.user_id == asset.responsible_user_id
    is_admin       = current_user.role    == "admin"
    if not is_responsible and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only the responsible person or an admin can confirm this asset"
        )

    asset.confirmed   = not asset.confirmed
    asset.updated_at  = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(asset)
    users_map = await _get_users_map(db)
    return asset_to_out(asset, users_map)


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: str, db: AsyncSession = Depends(get_db), _=Depends(require_editor)):
    asset = await db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    await db.delete(asset)
    await db.commit()
