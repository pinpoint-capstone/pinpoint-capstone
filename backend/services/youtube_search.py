import html
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
API = "https://www.googleapis.com/youtube/v3"


def _key() -> str:
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        raise RuntimeError("YOUTUBE_API_KEY가 .env에 없습니다")
    return key


def _thumb(snippet: dict) -> str | None:
    th = snippet.get("thumbnails", {})
    return (th.get("medium") or th.get("default") or {}).get("url")


def search_youtube(query: str, max_results: int = 5) -> list[dict]:
    r = requests.get(
        f"{API}/search",
        params={"part": "snippet", "q": query, "type": "video",
                "maxResults": max_results, "key": _key()},
        timeout=10,
    )
    r.raise_for_status()
    return [
        {
            "youtube_video_id": it["id"]["videoId"],
            "title": html.unescape(it["snippet"]["title"]),
            "channel_name": html.unescape(it["snippet"]["channelTitle"]),
            "thumbnail_url": _thumb(it["snippet"]),
            "published_at": it["snippet"]["publishedAt"],
        }
        for it in r.json().get("items", [])
    ]


def _parse_duration(iso: str) -> int | None:
    m = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return None
    h, mi, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mi * 60 + s


def fetch_video_meta(youtube_video_id: str) -> dict | None:
    """영상 1개의 제목/채널/길이를 조회합니다. 없는 영상이면 None."""
    r = requests.get(
        f"{API}/videos",
        params={"part": "snippet,contentDetails", "id": youtube_video_id, "key": _key()},
        timeout=10,
    )
    r.raise_for_status()
    items = r.json().get("items", [])
    if not items:
        return None
    sn = items[0]["snippet"]
    return {
        "title": html.unescape(sn["title"]),
        "channel_name": html.unescape(sn["channelTitle"]),
        "thumbnail_url": _thumb(sn),
        "published_at": sn["publishedAt"],
        "duration": _parse_duration(items[0]["contentDetails"].get("duration")),
    }


if __name__ == "__main__":
    for v in search_youtube(sys.argv[1] if len(sys.argv) > 1 else "손흥민 골"):
        print(v["youtube_video_id"], "|", v["title"], "|", v["channel_name"])