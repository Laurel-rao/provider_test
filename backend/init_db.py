"""Initialize the SQLite database with tables and seed admin user."""
import asyncio
from app.database import engine, Base, AsyncSessionLocal
from app.models import *  # noqa: F401,F403
from app.services.auth import get_password_hash
from app.models.user import User
from sqlalchemy import select


async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if result.scalar_one_or_none() is None:
            db.add(User(username="admin", password_hash=get_password_hash("admin123")))
            await db.commit()
            print("Created admin user (admin / admin123)")
        else:
            print("Admin user already exists")

    print("Database initialized successfully")


if __name__ == "__main__":
    asyncio.run(init())
