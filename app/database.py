from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer
import os
import time
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://palma:palma@localhost:5432/palma_assets"
)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,        # connections kept open per app instance
    max_overflow=5,     # extra connections allowed under burst load
    pool_timeout=30,    # seconds to wait for a free connection before erroring
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_tables():
    for attempt in range(1, 21):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database tables ready.")
            break
        except Exception as exc:
            logger.warning(f"DB not ready (attempt {attempt}/20): {exc}")
            if attempt < 20:
                time.sleep(3)
            else:
                raise

    await _seed_if_empty()


async def _seed_if_empty():
    from app.models import Asset, Category, User
    from app.auth import hash_password
    from sqlalchemy import select
    import uuid
    from datetime import datetime, timezone

    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)

        # ── Seed default admin user ──────────────────────────────────────────
        result = await db.execute(select(User))
        if not result.scalars().first():
            admin = User(
                user_id    = str(uuid.uuid4()),
                username   = "admin",
                email      = "admin@gtracker.local",
                full_name  = "System Administrator",
                role       = "admin",
                hashed_pw  = hash_password("admin123"),
                is_active  = True,
                created_at = now,
                updated_at = now,
            )
            db.add(admin)
            await db.commit()
            logger.info("Seeded default admin user (username: admin / password: admin123)")

        # ── Seed categories ──────────────────────────────────────────────────
        result = await db.execute(select(Category))
        if not result.scalars().first():
            for cat in [
                Category(category_id="rooms_facilities",      name="Rooms & Facilities",      icon="🏨", color="#C9A96E"),
                Category(category_id="furniture_equipment",   name="Furniture & Equipment",   icon="🪑", color="#7B9E87"),
                Category(category_id="vehicles_transport",    name="Vehicles & Transport",    icon="🚗", color="#6E8EAD"),
                Category(category_id="it_electronics",        name="IT & Electronics",        icon="💻", color="#9B7DB5"),
                Category(category_id="maintenance_tools",     name="Maintenance Tools",       icon="🔧", color="#C47F5A"),
                Category(category_id="inventory_consumables", name="Inventory & Consumables", icon="📦", color="#A0B894"),
            ]:
                db.add(cat)
            await db.commit()
            logger.info("Seeded categories.")

        # ── Seed sample assets ───────────────────────────────────────────────
        result = await db.execute(select(Asset))
        if not result.scalars().first():
            for a in [
                Asset(asset_id=str(uuid.uuid4()), name="Deluxe Room 101",            category="rooms_facilities",      status="available",   location="Building A, Floor 1", serial_number="RM-101",  purchase_date="2022-01-15", purchase_value="450000",  service_life_years=20, depreciation_method="straight_line",    accountable_department="Rooms Division",    accountable_person="Maria Santos",   notes="Sea view, king bed",               created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Suite 201",                   category="rooms_facilities",      status="in_use",      location="Building A, Floor 2", serial_number="RM-201",  purchase_date="2022-01-15", purchase_value="780000",  service_life_years=20, depreciation_method="straight_line",    accountable_department="Rooms Division",    accountable_person="Maria Santos",   notes="Jacuzzi suite",                    created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Conference Room Alpha",       category="rooms_facilities",      status="maintenance", location="Building B, Floor 1", serial_number="CR-001",  purchase_date="2021-06-01", purchase_value="1200000", service_life_years=25, depreciation_method="straight_line",    accountable_department="Events",            accountable_person="Jose Reyes",     notes="Projector and AV system included", created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Lobby Sofa Set",              category="furniture_equipment",   status="available",   location="Main Lobby",          serial_number="FE-0021", purchase_date="2023-03-10", purchase_value="85000",   service_life_years=10, depreciation_method="straight_line",    accountable_department="Housekeeping",      accountable_person="Ana Cruz",       notes="Leather, seats 8",                 created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Commercial Espresso Machine", category="furniture_equipment",   status="in_use",      location="Cafe Soleil",         serial_number="FE-0055", purchase_date="2023-07-20", purchase_value="120000",  service_life_years=7,  depreciation_method="declining_balance", accountable_department="Food & Beverage",   accountable_person="Carlo Dizon",    notes="La Marzocca GB5",                  created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Resort Van - Toyota HiAce",  category="vehicles_transport",    status="available",   location="Parking Bay 3",       serial_number="VT-001",  purchase_date="2021-11-05", purchase_value="1800000", service_life_years=10, depreciation_method="declining_balance", accountable_department="Transportation",    accountable_person="Ramon dela Cruz", notes="12-seater airport shuttle",        created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Golf Cart #4",                category="vehicles_transport",    status="maintenance", location="Golf Course Depot",   serial_number="VT-004",  purchase_date="2022-05-18", purchase_value="95000",   service_life_years=8,  depreciation_method="declining_balance", accountable_department="Recreation",        accountable_person="Ben Flores",     notes="Battery replacement due",          created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Front Desk POS Terminal",     category="it_electronics",        status="in_use",      location="Front Desk",          serial_number="IT-1001", purchase_date="2023-01-12", purchase_value="65000",   service_life_years=5,  depreciation_method="straight_line",    accountable_department="Front Office",      accountable_person="Liza Gomez",     notes="Dell Optiplex with POS software",  created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Security DVR System",         category="it_electronics",        status="in_use",      location="Security Room",       serial_number="IT-2008", purchase_date="2022-09-30", purchase_value="210000",  service_life_years=7,  depreciation_method="straight_line",    accountable_department="Security",          accountable_person="Edgar Tan",      notes="32-channel NVR, 64 cameras",       created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Industrial Pressure Washer",  category="maintenance_tools",     status="available",   location="Maintenance Shed",    serial_number="MT-0312", purchase_date="2022-04-22", purchase_value="28000",   service_life_years=8,  depreciation_method="straight_line",    accountable_department="Engineering",       accountable_person="Roy Mendoza",    notes="Karcher HD 5/15",                  created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Cordless Drill Set",          category="maintenance_tools",     status="in_use",      location="Maintenance Shed",    serial_number="MT-0088", purchase_date="2023-02-14", purchase_value="9500",    service_life_years=5,  depreciation_method="straight_line",    accountable_department="Engineering",       accountable_person="Roy Mendoza",    notes="Bosch 18V set, 3 units",           created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Bed Linen Stock - King",      category="inventory_consumables", status="available",   location="Linen Room B2",       serial_number="IC-5001", purchase_date="2024-01-08", purchase_value="42000",   service_life_years=3,  depreciation_method="none",             accountable_department="Housekeeping",      accountable_person="Ana Cruz",       notes="200 sets, 400TC Egyptian cotton",  created_at=now, updated_at=now),
                Asset(asset_id=str(uuid.uuid4()), name="Minibar Consumables Batch",   category="inventory_consumables", status="available",   location="Storage Room 3",      serial_number="IC-6210", purchase_date="2024-05-01", purchase_value="18500",   service_life_years=1,  depreciation_method="none",             accountable_department="Food & Beverage",   accountable_person="Carlo Dizon",    notes="Q2 2024 stock",                    created_at=now, updated_at=now),
            ]:
                db.add(a)
            await db.commit()
            logger.info("Seeded 13 sample assets.")
