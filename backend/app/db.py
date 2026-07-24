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
    """Add missing columns to existing tables via ALTER TABLE (non-destructive)."""
    import logging
    from sqlalchemy import text
    log = logging.getLogger("switchboard")
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        model_cols = {c.name for c in table.columns}
        db_cols = {c["name"] for c in inspector.get_columns(table.name)}
        missing = model_cols - db_cols
        if not missing:
            continue
        with engine.begin() as conn:
            for col_name in missing:
                col = table.columns[col_name]
                col_type = col.type.compile(engine.dialect)
                if col.nullable:
                    default = ""
                elif col.default is not None:
                    default = f" DEFAULT {col.default.arg!r}" if hasattr(col.default, "arg") else ""
                else:
                    default = " DEFAULT ''"
                stmt = f"ALTER TABLE {table.name} ADD COLUMN {col_name} {col_type}{' NULL' if col.nullable else ''}{default}"
                try:
                    conn.execute(text(stmt))
                    log.info(f"Added column '{table.name}.{col_name}' ({col_type})")
                except Exception as e:
                    log.warning(f"Could not add column '{table.name}.{col_name}': {e}")
