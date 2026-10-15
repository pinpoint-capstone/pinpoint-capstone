import json
from pathlib import Path
from functools import lru_cache

from faster_whisper import WhisperModel


@lru_cache(maxsize=1)
def get_whisper_model():
    return WhisperModel(
        "small",
        device="cpu",
        compute_type="int8"
    )


def transcribe_video(video_path, video_id):
    output_path = (
        Path("data/processed")
        / video_id
        / "subtitles.json"
    )
    output_path.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    segments, info = get_whisper_model().transcribe(
        str(video_path),
        beam_size=5
    )

    subtitles = [
        {
            "start_time": round(s.start, 2),
            "end_time": round(s.end, 2),
            "text": s.text.strip()
        }
        for s in segments
    ]

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(
            subtitles,
            f,
            ensure_ascii=False,
            indent=2
        )

    return str(output_path)
