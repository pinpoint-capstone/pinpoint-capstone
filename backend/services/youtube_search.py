import html
import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv("backend/.env")

def search_youtube(query: str, max_results: int = 5) -> list[dict]:
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        raise RuntimeError("YOUTUBE_API_KEY가 .env에 없습니다")
    r = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": max_results,
            "key": key,
        },
        timeout=10,
    )
    r.raise_for_status()
    return [
        {
            "youtube_video_id": it["id"]["videoId"],
            "title": html.unescape(it["snippet"]["title"]),
            "channel_name": it["snippet"]["channelTitle"],
            "published_at": it["snippet"]["publishedAt"],
        }
        for it in r.json().get("items", [])
    ]

if __name__ == "__main__":
    for v in search_youtube(sys.argv[1] if len(sys.argv) > 1 else "손흥민 골"):
        print(v["youtube_video_id"], "|", v["title"], "|", v["channel_name"])