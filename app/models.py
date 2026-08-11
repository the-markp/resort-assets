from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, Numeric, ForeignKey
from pydantic import BaseModel
from typing import Optional, Literal, List
from datetime import datetime, date
from decimal import Decimal

from app.database import Base


# ─── SQLAlchemy ORM models ────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    user_id    = Column(String,  primary_key=True)
    username   = Column(String,  nullable=False, unique=True, index=True)
    email      = Column(String,  nullable=True,  unique=True)
    full_name  = Column(String,  nullable=True)
    role       = Column(String,  nullable=False, default="viewer")
    hashed_pw  = Column(String,  nullable=False)
    is_active  = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)


class Asset(Base):
    __tablename__ = "assets"
    asset_id               = Column(String,        primary_key=True)
    asset_number           = Column(String,        nullable=True, unique=True, index=True)  # human-readable unique ID e.g. AST-00042
    name                   = Column(String,        nullable=False)
    category               = Column(String,        nullable=False, index=True)
    status                 = Column(String,        nullable=False, default="available", index=True)
    location               = Column(String,        nullable=True)
    serial_number          = Column(String,        nullable=True)
    purchase_date          = Column(String,        nullable=True)
    purchase_value         = Column(String,        nullable=True)
    service_life_years     = Column(Integer,       nullable=True)
    depreciation_method    = Column(String,        nullable=True)
    depreciation_rate      = Column(Numeric(7, 4), nullable=True)
    repair_cost            = Column(Numeric(14, 2),nullable=True)   # subtracted from book value
    accountable_department = Column(String,        nullable=True)
    accountable_person     = Column(String,        nullable=True)
    notes                  = Column(Text,          nullable=True)
    created_at             = Column(DateTime(timezone=True), nullable=False)
    updated_at             = Column(DateTime(timezone=True), nullable=False)


class Category(Base):
    __tablename__ = "categories"
    category_id = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    icon        = Column(String, nullable=True)
    color       = Column(String, nullable=True)


class AppSetting(Base):
    """Key-value store for app-wide settings (logo path, etc.)"""
    __tablename__ = "app_settings"
    key        = Column(String, primary_key=True)
    value      = Column(Text,   nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)


class Incident(Base):
    __tablename__ = "incidents"
    incident_id   = Column(String,  primary_key=True)
    asset_id      = Column(String,  ForeignKey("assets.asset_id", ondelete="SET NULL"), nullable=True, index=True)
    asset_name    = Column(String,  nullable=True)   # snapshot in case asset is deleted
    title         = Column(String,  nullable=False)
    description   = Column(Text,    nullable=False)
    severity      = Column(String,  nullable=False, default="medium")  # low|medium|high|critical
    status        = Column(String,  nullable=False, default="open", index=True)  # open|in_progress|resolved|closed
    reported_by   = Column(String,  nullable=False)   # user_id
    reporter_name = Column(String,  nullable=True)    # snapshot
    assigned_to   = Column(String,  nullable=True)    # user_id
    resolution    = Column(Text,    nullable=True)
    created_at    = Column(DateTime(timezone=True), nullable=False)
    updated_at    = Column(DateTime(timezone=True), nullable=False)


class PolicyDocument(Base):
    __tablename__ = "policy_documents"
    doc_id        = Column(String,  primary_key=True)
    name          = Column(String,  nullable=False)
    description   = Column(Text,    nullable=True)
    filename      = Column(String,  nullable=False)   # original upload filename
    file_path     = Column(String,  nullable=False)   # path on disk
    file_size     = Column(Integer, nullable=True)    # bytes
    uploaded_by   = Column(String,  nullable=True)    # user_id snapshot
    uploader_name = Column(String,  nullable=True)    # display name snapshot
    created_at    = Column(DateTime(timezone=True), nullable=False)
    updated_at    = Column(DateTime(timezone=True), nullable=False)


class IncidentComment(Base):
    __tablename__ = "incident_comments"
    comment_id  = Column(String, primary_key=True)
    incident_id = Column(String, ForeignKey("incidents.incident_id", ondelete="CASCADE"), nullable=False, index=True)
    author_id   = Column(String, nullable=False)
    author_name = Column(String, nullable=True)
    body        = Column(Text,   nullable=False)
    created_at  = Column(DateTime(timezone=True), nullable=False)


# ─── Book value computation ───────────────────────────────────────────────────

def compute_book_value(a) -> Optional[float]:
    try:
        cost = float(a.purchase_value or 0)
        if cost <= 0:
            return None
        method = a.depreciation_method or "none"
        life   = int(a.service_life_years or 0)

        if method == "none":
            bv = cost
        elif not a.purchase_date:
            bv = cost
        else:
            purchase  = date.fromisoformat(str(a.purchase_date))
            age_years = (date.today() - purchase).days / 365.25

            if method == "straight_line":
                bv = cost - (cost / life) * age_years if life > 0 else cost
            elif method == "declining_balance":
                rate = 2.0 / life if life > 0 else 0
                bv   = cost * ((1 - rate) ** age_years)
            elif method == "custom_rate":
                rate_pct = float(a.depreciation_rate or 0)
                rate     = rate_pct / 100.0
                bv       = cost * ((1 - rate) ** age_years) if rate > 0 else cost
            else:
                bv = cost

        bv = max(bv, 0.0)

        # Subtract accumulated repair costs
        repair = float(a.repair_cost or 0)
        bv     = max(bv - repair, 0.0)

        return round(bv, 2)
    except Exception:
        return None


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

AssetStatus        = Literal["available", "in_use", "maintenance", "retired", "lost"]
AssetCategory      = Literal["rooms_facilities","furniture_equipment","vehicles_transport",
                              "it_electronics","maintenance_tools","inventory_consumables"]
DepreciationMethod = Literal["straight_line","declining_balance","custom_rate","none"]
UserRole           = Literal["admin","editor","viewer"]
IncidentSeverity   = Literal["low","medium","high","critical"]
IncidentStatus     = Literal["open","in_progress","resolved","closed"]


class AssetCreate(BaseModel):
    asset_number:           Optional[str]                = None
    name:                   str
    category:               AssetCategory
    status:                 AssetStatus                  = "available"
    location:               Optional[str]                = None
    serial_number:          Optional[str]                = None
    purchase_date:          Optional[str]                = None
    purchase_value:         Optional[str]                = None
    service_life_years:     Optional[int]                = None
    depreciation_method:    Optional[DepreciationMethod] = None
    depreciation_rate:      Optional[float]              = None
    repair_cost:            Optional[float]              = None
    accountable_department: Optional[str]                = None
    accountable_person:     Optional[str]                = None
    notes:                  Optional[str]                = None


class AssetUpdate(BaseModel):
    asset_number:           Optional[str]                = None
    name:                   Optional[str]                = None
    category:               Optional[AssetCategory]      = None
    status:                 Optional[AssetStatus]        = None
    location:               Optional[str]                = None
    serial_number:          Optional[str]                = None
    purchase_date:          Optional[str]                = None
    purchase_value:         Optional[str]                = None
    service_life_years:     Optional[int]                = None
    depreciation_method:    Optional[DepreciationMethod] = None
    depreciation_rate:      Optional[float]              = None
    repair_cost:            Optional[float]              = None
    accountable_department: Optional[str]                = None
    accountable_person:     Optional[str]                = None
    notes:                  Optional[str]                = None


class AssetOut(BaseModel):
    asset_id:               str
    asset_number:           Optional[str]
    name:                   str
    category:               str
    status:                 str
    location:               Optional[str]
    serial_number:          Optional[str]
    purchase_date:          Optional[str]
    purchase_value:         Optional[str]
    service_life_years:     Optional[int]
    depreciation_method:    Optional[str]
    depreciation_rate:      Optional[float]
    repair_cost:            Optional[float]
    accountable_department: Optional[str]
    accountable_person:     Optional[str]
    notes:                  Optional[str]
    book_value:             Optional[float] = None
    created_at:             datetime
    updated_at:             datetime
    model_config = {"from_attributes": True}


def asset_to_out(a) -> AssetOut:
    obj = AssetOut.model_validate(a)
    obj.book_value = compute_book_value(a)
    if obj.depreciation_rate is not None:
        obj.depreciation_rate = float(obj.depreciation_rate)
    if obj.repair_cost is not None:
        obj.repair_cost = float(obj.repair_cost)
    return obj


class CategoryOut(BaseModel):
    category_id: str
    name:        str
    icon:        Optional[str]
    color:       Optional[str]
    model_config = {"from_attributes": True}


# ─── Incident schemas ─────────────────────────────────────────────────────────

class IncidentCreate(BaseModel):
    asset_id:    Optional[str]       = None
    title:       str
    description: str
    severity:    IncidentSeverity    = "medium"


class IncidentUpdate(BaseModel):
    title:       Optional[str]             = None
    description: Optional[str]            = None
    severity:    Optional[IncidentSeverity]= None
    status:      Optional[IncidentStatus] = None
    assigned_to: Optional[str]            = None
    resolution:  Optional[str]            = None


class CommentCreate(BaseModel):
    body: str


class CommentOut(BaseModel):
    comment_id:  str
    incident_id: str
    author_id:   str
    author_name: Optional[str]
    body:        str
    created_at:  datetime
    model_config = {"from_attributes": True}


class IncidentOut(BaseModel):
    incident_id:   str
    asset_id:      Optional[str]
    asset_name:    Optional[str]
    title:         str
    description:   str
    severity:      str
    status:        str
    reported_by:   str
    reporter_name: Optional[str]
    assigned_to:   Optional[str]
    resolution:    Optional[str]
    comments:      List[CommentOut] = []
    created_at:    datetime
    updated_at:    datetime
    model_config = {"from_attributes": True}


# ─── Policy document schemas ─────────────────────────────────────────────────

class PolicyDocumentOut(BaseModel):
    doc_id:        str
    name:          str
    description:   Optional[str]
    filename:      str
    file_size:     Optional[int]
    uploaded_by:   Optional[str]
    uploader_name: Optional[str]
    created_at:    datetime
    updated_at:    datetime
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
    user_id:    str
    username:   str
    email:      Optional[str]
    full_name:  Optional[str]
    role:       str
    is_active:  bool
    created_at: datetime
    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
