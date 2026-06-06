from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Category, CategoryOut
from app.auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    result = await db.execute(select(Category))
    return result.scalars().all()
