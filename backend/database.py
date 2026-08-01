# backend/database.py
# =============================================================
# Async SQLAlchemy database setup with Smart Fallback
# =============================================================
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker, AsyncEngine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from config import settings
from fastapi import HTTPException
import structlog
import ssl
import asyncio

logger = structlog.get_logger()

# Create a custom SSL context that ignores verification (common for cloud test envs)
ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE

def create_drpe_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
        echo=settings.DEBUG
    )


# Global instances
_engine = create_drpe_engine(settings.DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(
    _engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

class Base(DeclarativeBase):
    pass

async def get_db():
    """FastAPI dependency: yields an async database session for the Cloud DB."""
    try:
        async with AsyncSessionLocal() as session:
            yield session
            await session.commit()
    except Exception as e:
        logger.error("Database operation failed", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Database synchronization error: {str(e)}"
        )

async def check_db_connection() -> bool:
    """Health check: verify DB connectivity."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error("DB connection health check failed", error=str(e))
        return False
