from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime, timezone
import uuid

from app.database import get_db
from app.models import User, UserCreate, UserUpdate, UserOut
from app.auth import hash_password, require_admin, get_current_user

router = APIRouter()


@router.get("/", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == payload.username))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="Username already exists")

    now  = datetime.now(timezone.utc)
    user = User(
        user_id    = str(uuid.uuid4()),
        username   = payload.username,
        email      = payload.email,
        full_name  = payload.full_name,
        role       = payload.role,
        hashed_pw  = hash_password(payload.password),
        is_active  = True,
        created_at = now,
        updated_at = now,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Admins can edit anyone; non-admins can only edit themselves (no role change)
    if current_user.role != "admin" and current_user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not allowed")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates = payload.model_dump(exclude_none=True)
    if "password" in updates:
        user.hashed_pw = hash_password(updates.pop("password"))
    # Non-admins cannot change their own role
    if current_user.role != "admin":
        updates.pop("role", None)

    for field, value in updates.items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_admin),
):
    if current_user.user_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
