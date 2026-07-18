import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import KnowledgeChunk
from app.services.embeddings import embed_text

MAX_CHUNK_LENGTH = 1500


def chunk_text(content: str, max_length: int = MAX_CHUNK_LENGTH) -> list[str]:
    if len(content) <= max_length:
        return [content]
    paragraphs = content.split("\n\n")
    chunks = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 > max_length and current:
            chunks.append(current.strip())
            current = para
        else:
            current = current + "\n\n" + para if current else para
    if current.strip():
        chunks.append(current.strip())
    return chunks


def index_content(
    db: Session,
    user_id: str,
    source_type: str,
    source_id: str,
    title: str,
    content: str,
):
    db.query(KnowledgeChunk).filter(
        KnowledgeChunk.source_id == source_id,
        KnowledgeChunk.user_id == user_id,
    ).delete()

    chunks = chunk_text(content)
    for chunk in chunks:
        vec = embed_text(chunk)
        db.add(KnowledgeChunk(
            id=str(uuid.uuid4()),
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            title=title,
            content=chunk,
            embedding=vec,
        ))
    db.commit()
    return len(chunks)


def retrieve(db: Session, user_id: str, query: str, top_k: int = 3) -> list[dict]:
    vec = embed_text(query)
    vec_str = "[" + ",".join(str(v) for v in vec) + "]"

    results = db.execute(
        text("""
            SELECT id, source_type, source_id, title, content,
                   embedding <=> :vec AS distance
            FROM knowledge_chunks
            WHERE user_id = :uid
            ORDER BY embedding <=> :vec
            LIMIT :k
        """),
        {"vec": vec_str, "uid": user_id, "k": top_k},
    ).fetchall()

    return [
        {
            "source_type": r.source_type,
            "source_id": r.source_id,
            "title": r.title,
            "content": r.content,
            "distance": float(r.distance),
        }
        for r in results
        if r.distance < 0.8
    ]
