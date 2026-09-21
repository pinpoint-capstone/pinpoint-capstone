import cv2

video_path = "data/raw/test_audio.mp4"

cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("영상 파일을 열 수 없습니다.")
    exit()

fps = cap.get(cv2.CAP_PROP_FPS)
frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

duration = frame_count / fps if fps > 0 else 0

print("=== Video Metadata ===")
print(f"FPS: {fps}")
print(f"Frame Count: {int(frame_count)}")
print(f"Resolution: {int(width)} x {int(height)}")
print(f"Duration: {duration:.2f} seconds")

cap.release()