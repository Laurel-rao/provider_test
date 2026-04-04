from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.user import User
from app.services.auth import get_password_hash


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start/stop the monitor scheduler."""
    # Startup: import and start scheduler when available
    try:
        from app.services.monitor_scheduler import scheduler

        await scheduler.start()
    except ImportError:
        pass

    if settings.ADMIN_PASSWORD:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(User).where(User.username == settings.ADMIN_USERNAME))
                user = result.scalar_one_or_none()
                legacy_admin = None
                if settings.ADMIN_USERNAME != "admin":
                    legacy_result = await db.execute(select(User).where(User.username == "admin"))
                    legacy_admin = legacy_result.scalar_one_or_none()
                pw_hash = get_password_hash(settings.ADMIN_PASSWORD)
                if user is None:
                    if legacy_admin is not None:
                        legacy_admin.username = settings.ADMIN_USERNAME
                        legacy_admin.password_hash = pw_hash
                    else:
                        db.add(User(username=settings.ADMIN_USERNAME, password_hash=pw_hash))
                else:
                    user.password_hash = pw_hash
                    if legacy_admin is not None and legacy_admin.id != user.id:
                        await db.delete(legacy_admin)
                await db.commit()
        except Exception:
            pass

    yield

    # Shutdown: stop scheduler when available
    try:
        from app.services.monitor_scheduler import scheduler

        await scheduler.stop()
    except ImportError:
        pass


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
)

# CORS middleware - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from app.routers import auth, endpoints, keys, monitor, records, stats, alerts, logs, ai_providers

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(endpoints.router, prefix="/api/endpoints", tags=["endpoints"])
app.include_router(keys.router, prefix="/api/keys", tags=["keys"])
app.include_router(monitor.router, prefix="/api/monitor", tags=["monitor"])
app.include_router(records.router, prefix="/api/records", tags=["records"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(ai_providers.router, prefix="/api/ai-providers", tags=["ai-providers"])
