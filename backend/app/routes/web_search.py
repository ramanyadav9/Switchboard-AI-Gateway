from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models import User
from app.routes.auth import get_current_user
from app.services.search import search_web
from app.services.web_fetch import fetch_url_content

router = APIRouter()


class SearchRequest(BaseModel):
    query: str
    num_results: int = 10


class FetchRequest(BaseModel):
    url: str


@router.post("/search")
async def web_search(
    body: SearchRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    try:
        results = await search_web(body.query, body.num_results)
        return {"results": results, "query": body.query}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Search failed: {e}")


@router.post("/fetch")
async def web_fetch(
    body: FetchRequest,
    user: Annotated[User, Depends(get_current_user)],
):
    result = await fetch_url_content(body.url)
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result.get("error", "Fetch failed"))
    return result
