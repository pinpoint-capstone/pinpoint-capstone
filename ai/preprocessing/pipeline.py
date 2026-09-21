import subprocess
import sys


scripts = [
    "ai/preprocessing/video_metadata.py",
    "ai/preprocessing/segment_video.py",
    "ai/preprocessing/extract_frames.py",
    "ai/preprocessing/parse_subtitle.py",
    "ai/preprocessing/align_transcript.py",
    "ai/preprocessing/build_video_data.py",
]


print("====================================")
print(" Video Preprocessing Pipeline Start")
print("====================================")
print()


for script in scripts:

    print(f"[실행] {script}")

    result = subprocess.run(
        [sys.executable, script]
    )

    if result.returncode != 0:
        print()
        print(f"[실패] {script}")
        print("Pipeline을 중단합니다.")
        sys.exit(1)

    print(f"[완료] {script}")
    print()


print("====================================")
print(" Video Preprocessing Pipeline Done!")
print("====================================")

print()
print(
    "최종 결과:"
    " data/processed/video_001/video_data.json"
)