import httpx

from app.config import get_settings

settings = get_settings()


async def search_web(query: str, num_results: int = 10) -> list[dict]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{settings.SEARXNG_URL}/search",
            params={
                "q": query,
                "format": "json",
                "language": "en",
                "safesearch": "2",
                "categories": "general",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        results = []
        seen = set()
        for r in data.get("results", []):
            url = r.get("url", "")
            if not url or url in seen:
                continue
            seen.add(url)
            results.append({
                "title": r.get("title", ""),
                "url": url,
                "snippet": r.get("content", ""),
            })
            if len(results) >= num_results:
                break
        return results
