from pathlib import Path
import sys


# --------------------------------------------------
# Moment-DETR repository 경로
# --------------------------------------------------

MOMENT_DETR_ROOT = Path(
    "ai/external/moment_detr"
)

sys.path.append(
    str(MOMENT_DETR_ROOT.resolve())
)


# --------------------------------------------------
# Import
# --------------------------------------------------

from run_on_video.data_utils import (
    ClipFeatureExtractor
)


# --------------------------------------------------
# 설정
# --------------------------------------------------

video_path = Path(
    "data/raw/test_audio.mp4"
)


# --------------------------------------------------
# Feature Extractor 생성
# --------------------------------------------------

print("Feature Extractor 생성 시작...")

extractor = ClipFeatureExtractor(
    framerate=1 / 2,
    size=224,
    centercrop=True,
    model_name_or_path="ViT-B/32",
    device="cpu"
)

print("Feature Extractor 생성 성공!")


# --------------------------------------------------
# Video Feature 추출
# --------------------------------------------------

print()
print("Video Feature 추출 시작...")

video_features = extractor.encode_video(
    str(video_path)
)

print()
print("Video Feature 추출 성공!")

print(
    "Feature shape:",
    video_features.shape
)

output_dir = Path(
    "data/features"
)

output_dir.mkdir(
    parents=True,
    exist_ok=True
)

output_path = (
    output_dir
    / "video_001_clip_features.pt"
)

import torch

torch.save(
    video_features,
    output_path
)

print()
print(
    f"Feature 저장 완료: {output_path}"
)