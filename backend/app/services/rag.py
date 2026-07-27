import uuid
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
    metadata: dict | None = None,
):
    """Embed `content` (chunked) and store it, replacing any prior chunks for source_id.

    `metadata` is stored as-is (e.g. {"conversation_id": ...}) so retrieval can scope
    results to a single conversation.
    """
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
            metadata_json=metadata,
        ))
    db.commit()
    return len(chunks)


def retrieve(
    db: Session,
    user_id: str,
    query: str,
    top_k: int = 3,
    conversation_id: str | None = None,
    scope: str = "this_chat",
    max_distance: float = 0.8,
) -> list[dict]:
    """Semantic search over the user's memory.

    scope:
      "this_chat"  — only chunks belonging to `conversation_id` (a chat recalls itself,
                     never other chats). Requires conversation_id; returns [] without it.
      "all_chats"  — every chunk for the user (the future "let this chat see my other
                     chats" toggle). Not used by default.
    """
    if not query.strip():
        return []
    if scope == "this_chat" and not conversation_id:
        return []

    vec = embed_text(query)
    vec_str = "[" + ",".join(str(v) for v in vec) + "]"

    where = "user_id = :uid"
    params: dict = {"vec": vec_str, "uid": user_id, "k": top_k}
    if scope == "this_chat":
        # Match turn chunks tagged with the conversation, plus summary chunks whose
        # source_id IS the conversation id (older/untagged rows).
        where += " AND ((metadata_json->>'conversation_id') = :conv OR source_id = :conv)"
        params["conv"] = conversation_id

    rows = db.execute(
        text(f"""
            SELECT id, source_type, source_id, title, content, metadata_json,
                   embedding <=> :vec AS distance
            FROM knowledge_chunks
            WHERE {where}
            ORDER BY embedding <=> :vec
            LIMIT :k
        """),
        params,
    ).fetchall()

    out: list[dict] = []
    for r in rows:
        if r.distance >= max_distance:
            continue
        md = getattr(r, "metadata_json", None)
        out.append({
            "source_type": r.source_type,
            "source_id": r.source_id,
            "conversation_id": md.get("conversation_id") if isinstance(md, dict) else None,
            "title": r.title,
            "content": r.content,
            "distance": float(r.distance),
        })
    return out
