import json
import cv2
from pathlib import Path


video_path = "data/raw/test_audio.mp4"

segments_path = Path(
    "data/processed/video_001/segments_with_subtitles.json"
)

output_path = Path(
    "data/processed/video_001/video_data.json"
)

video_id = "video_001"


# --------------------------------------------------
# 영상 metadata 읽기
# --------------------------------------------------

cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("영상 파일을 열 수 없습니다.")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

duration = frame_count / fps if fps > 0 else 0

cap.release()


# --------------------------------------------------
# segment + subtitle 데이터 불러오기
# --------------------------------------------------

with open(
    segments_path,
    "r",
    encoding="utf-8"
) as f:
    segments = json.load(f)


# --------------------------------------------------
# 최종 AI 입력 데이터 구성
# --------------------------------------------------

video_data = {
    "video_id": video_id,
    "duration": round(duration, 2),
    "fps": round(fps, 2),
    "width": int(width),
    "height": int(height),
    "segments": segments
}


# --------------------------------------------------
# JSON 저장
# --------------------------------------------------

with open(
    output_path,
    "w",
    encoding="utf-8"
) as f:
    json.dump(
        video_data,
        f,
        ensure_ascii=False,
        indent=2
    )


# --------------------------------------------------
# 결과 확인
# --------------------------------------------------

print("=== Final Video Data ===")
print(f"Video ID: {video_id}")
print(f"Duration: {duration:.2f} seconds")
print(f"FPS: {fps:.2f}")
print(f"Resolution: {int(width)} x {int(height)}")
print(f"Total Segments: {len(segments)}")
print()
print(f"저장 위치: {output_path}")