import re

import httpx

MAX_CONTENT_LENGTH = 15000
USER_AGENT = "Mozilla/5.0 (compatible; SwitchboardBot/1.0)"


async def fetch_url_content(url: str, timeout: float = 15.0) -> dict:
    try:
        async with httpx.AsyncClient(
            timeout=timeout, follow_redirects=True, max_redirects=5
        ) as client:
            resp = await client.get(url, headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            html = resp.text

            text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
            text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.I)
            text = re.sub(r"<nav[^>]*>[\s\S]*?</nav>", "", text, flags=re.I)
            text = re.sub(r"<footer[^>]*>[\s\S]*?</footer>", "", text, flags=re.I)
            text = re.sub(r"<header[^>]*>[\s\S]*?</header>", "", text, flags=re.I)
            text = re.sub(r"<!--[\s\S]*?-->", "", text)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()

            if len(text) > MAX_CONTENT_LENGTH:
                text = text[:MAX_CONTENT_LENGTH] + "..."

            return {"success": True, "content": text, "url": url}
    except Exception as e:
        return {"success": False, "content": "", "url": url, "error": str(e)}
