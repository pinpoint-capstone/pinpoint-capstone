from pathlib import Path
import yt_dlp

def download_video(youtube_id: str, out_dir: str = "data/raw") -> Path:
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    opts = {
        "format": "bv*[height<=480][vcodec^=avc1]+ba[ext=m4a]/b[height<=480][vcodec^=avc1]/bv*[height<=480]+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": f"{out_dir}/%(id)s.%(ext)s",
        "noplaylist": True,
        "quiet": True,
        "retries": 3,
        "socket_timeout": 30,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([f"https://www.youtube.com/watch?v={youtube_id}"])
    return Path(out_dir) / f"{youtube_id}.mp4"

if __name__ == "__main__":
    import sys
    p = download_video(sys.argv[1])
    print("saved:", p, p.stat().st_size // 1024, "KB")