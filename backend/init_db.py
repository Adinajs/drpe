# backend/init_db.py
import asyncio
import structlog
from database import _engine, Base
from models import *  # Import models to ensure they are registered with Base

structlog.configure()
logger = structlog.get_logger()

async def init_db():
    logger.info("Initializing database schema in Supabase...")
    try:
        async with _engine.begin() as conn:
            # Create all tables and Enums
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database", error=str(e))
        raise e

if __name__ == "__main__":
    asyncio.run(init_db())
