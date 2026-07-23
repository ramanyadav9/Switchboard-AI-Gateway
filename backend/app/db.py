from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_settings

settings = get_settings()

connect_args: dict = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    import app.models  # noqa: F401  (ensures models are registered on Base)

    if not settings.DATABASE_URL.startswith("sqlite"):
        from sqlalchemy import text, inspect
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
            except Exception:
                conn.rollback()

        inspector = inspect(engine)
        _sync_table_schemas(inspector)

    Base.metadata.create_all(bind=engine)


def _sync_table_schemas(inspector) -> None:
    """Drop and recreate tables whose columns don't match the model."""
    from sqlalchemy import text
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        model_cols = {c.name for c in table.columns}
        db_cols = {c["name"] for c in inspector.get_columns(table.name)}
        missing = model_cols - db_cols
        if missing:
            with engine.begin() as conn:
                conn.execute(text(f"DROP TABLE IF EXISTS {table.name} CASCADE"))
            import logging
            logging.getLogger("switchboard").info(
                f"Recreating table '{table.name}' (missing columns: {missing})"
            )
