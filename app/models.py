from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer
from pydantic import BaseModel, EmailStr
from typing import Optional, Literal
from datetime import datetime

from app.database import Base


# ─── SQLAlchemy ORM models ────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    user_id    = Column(String,  primary_key=True)
    username   = Column(String,  nullable=False, unique=True, index=True)
    email      = Column(String,  nullable=True,  unique=True)
    full_name  = Column(String,  nullable=True)
    role       = Column(String,  nullable=False, default="viewer")   # admin | editor | viewer
    hashed_pw  = Column(String,  nullable=False)
    is_active  = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)


class Asset(Base):
    __tablename__ = "assets"

    asset_id               = Column(String,  primary_key=True)
    name                   = Column(String,  nullable=False)
    category               = Column(String,  nullable=False, index=True)
    status                 = Column(String,  nullable=False, default="available", index=True)
    location               = Column(String,  nullable=True)
    serial_number          = Column(String,  nullable=True)
    purchase_date          = Column(String,  nullable=True)
    purchase_value         = Column(String,  nullable=True)
    # New fields
    service_life_years     = Column(Integer, nullable=True)   # expected useful life in years
    depreciation_method    = Column(String,  nullable=True)   # straight_line | declining_balance | none
    accountable_department = Column(String,  nullable=True)
    accountable_person     = Column(String,  nullable=True)
    notes                  = Column(Text,    nullable=True)
    created_at             = Column(DateTime(timezone=True), nullable=False)
    updated_at             = Column(DateTime(timezone=True), nullable=False)


class Category(Base):
    __tablename__ = "categories"

    category_id = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    icon        = Column(String, nullable=True)
    color       = Column(String, nullable=True)


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

AssetStatus = Literal["available", "in_use", "maintenance", "retired", "lost"]
AssetCategory = Literal[
    "rooms_facilities", "furniture_equipment", "vehicles_transport",
    "it_electronics", "maintenance_tools", "inventory_consumables",
]
DepreciationMethod = Literal["straight_line", "declining_balance", "none"]
UserRole = Literal["admin", "editor", "viewer"]


class AssetCreate(BaseModel):
    name:                   str
    category:               AssetCategory
    status:                 AssetStatus           = "available"
    location:               Optional[str]         = None
    serial_number:          Optional[str]         = None
    purchase_date:          Optional[str]         = None
    purchase_value:         Optional[str]         = None
    service_life_years:     Optional[int]         = None
    depreciation_method:    Optional[DepreciationMethod] = None
    accountable_department: Optional[str]         = None
    accountable_person:     Optional[str]         = None
    notes:                  Optional[str]         = None


class AssetUpdate(BaseModel):
    name:                   Optional[str]                  = None
    category:               Optional[AssetCategory]        = None
    status:                 Optional[AssetStatus]          = None
    location:               Optional[str]                  = None
    serial_number:          Optional[str]                  = None
    purchase_date:          Optional[str]                  = None
    purchase_value:         Optional[str]                  = None
    service_life_years:     Optional[int]                  = None
    depreciation_method:    Optional[DepreciationMethod]   = None
    accountable_department: Optional[str]                  = None
    accountable_person:     Optional[str]                  = None
    notes:                  Optional[str]                  = None


class AssetOut(BaseModel):
    asset_id:               str
    name:                   str
    category:               str
    status:                 str
    location:               Optional[str]
    serial_number:          Optional[str]
    purchase_date:          Optional[str]
    purchase_value:         Optional[str]
    service_life_years:     Optional[int]
    depreciation_method:    Optional[str]
    accountable_department: Optional[str]
    accountable_person:     Optional[str]
    notes:                  Optional[str]
    created_at:             datetime
    updated_at:             datetime
    model_config = {"from_attributes": True}


class CategoryOut(BaseModel):
    category_id: str
    name:        str
    icon:        Optional[str]
    color:       Optional[str]
    model_config = {"from_attributes": True}


# ─── User schemas ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username:  str
    email:     Optional[str] = None
    full_name: Optional[str] = None
    role:      UserRole      = "viewer"
    password:  str


class UserUpdate(BaseModel):
    email:     Optional[str]      = None
    full_name: Optional[str]      = None
    role:      Optional[UserRole] = None
    password:  Optional[str]      = None
    is_active: Optional[bool]     = None


class UserOut(BaseModel):
    user_id:   str
    username:  str
    email:     Optional[str]
    full_name: Optional[str]
    role:      str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
