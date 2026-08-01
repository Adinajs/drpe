import asyncio
from sqlalchemy import text
from backend.database import AsyncSessionLocal
import structlog

logger = structlog.get_logger()

SQL_STATEMENTS = [
    # 1. Extensions
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    
    # 2. Users Table
    """
    CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(255),
        role          VARCHAR(50) DEFAULT 'Operative',
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,

    # 3. Api Tokens Relation
    """
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_tokens' AND column_name='user_id') THEN
            ALTER TABLE api_tokens ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END
    $$;
    """
]


async def run_setup():
    print("Initiating Database Integrity Check...")
    async with AsyncSessionLocal() as db:
        try:
            for statement in SQL_STATEMENTS:
                if statement.strip():
                    print(f"Executing: {statement.strip()[:50]}...")
                    await db.execute(text(statement))
            await db.commit()
            print("DATABASE_INTEGRITY: OK (Users table and Relations verified)")
        except Exception as e:
            print(f"DATABASE_INTEGRITY: FAILED - {e}")
            await db.rollback()


if __name__ == "__main__":
    asyncio.run(run_setup())
