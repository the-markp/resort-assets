from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from collections import defaultdict

from app.database import get_db
from app.models import Asset
from app.auth import get_current_user

router = APIRouter()


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Asset))
    items  = result.scalars().all()

    total       = len(items)
    by_status   = defaultdict(int)
    by_category = defaultdict(int)
    total_value = 0.0

    for item in items:
        by_status[item.status]     += 1
        by_category[item.category] += 1
        if item.purchase_value:
            try:
                total_value += float(item.purchase_value)
            except (ValueError, TypeError):
                pass

    recent = sorted(items, key=lambda x: x.created_at, reverse=True)[:5]

    def to_dict(a):
        return {
            "asset_id":               a.asset_id,
            "name":                   a.name,
            "category":               a.category,
            "status":                 a.status,
            "location":               a.location,
            "serial_number":          a.serial_number,
            "purchase_date":          a.purchase_date,
            "purchase_value":         a.purchase_value,
            "service_life_years":     a.service_life_years,
            "depreciation_method":    a.depreciation_method,
            "accountable_department": a.accountable_department,
            "accountable_person":     a.accountable_person,
            "notes":                  a.notes,
            "created_at":             a.created_at.isoformat() if a.created_at else None,
            "updated_at":             a.updated_at.isoformat() if a.updated_at else None,
        }

    return {
        "total_assets":  total,
        "total_value":   round(total_value, 2),
        "by_status":     dict(by_status),
        "by_category":   dict(by_category),
        "recent_assets": [to_dict(a) for a in recent],
    }
