# PinPoint

AI-based Multimodal Video Moment Search Capstone Project

PinPoint는 사용자가 자연어로 원하는 장면을 검색하면,
영상 내에서 해당 내용과 가장 관련 있는 구간을 찾아주는 멀티모달 영상 검색 서비스입니다.

예시

> "축구선수가 골을 넣는 장면"

→ 관련 영상 및 해당 구간(timestamp)을 검색하여 제공합니다.

---

## Main Features

- 자연어 기반 영상 검색
- 영상 구간 단위 분석
- Video / Text Embedding 기반 유사도 검색
- 검색 결과 Timestamp 제공
- 영상 미리보기 및 해당 구간 이동

---

## Project Structure

    pinpoint-capstone/
    ├── frontend/           # Web UI
    ├── backend/            # API / Server
    ├── ai/
    │   ├── preprocessing/  # Video preprocessing
    │   ├── embedding/      # Video / Text embedding
    │   ├── retrieval/      # Moment retrieval
    │   └── experiments/    # Model experiments
    ├── data/               # Dataset information
    ├── docs/               # Project documents
    └── README.md

---

## Team

| Part | Role |
|---|---|
| Frontend | UI / UX 및 웹 구현 |
| Backend | API 및 서버 구현 |
| AI | 영상 전처리, 임베딩 및 검색 모델 구현 |

---

## AI Pipeline

    Video
      ↓
    Video Preprocessing
      ↓
    Segment / Frame Extraction
      ↓
    Video Embedding
      ↓
    Vector Database

    Natural Language Query
      ↓
    Text Embedding
      ↓
    Similarity Search
      ↓
    Relevant Video Moment

---

## Tech Stack

### Frontend
- TBD

### Backend
- TBD

### AI
- Python
- PyTorch
- FFmpeg
- Multimodal Video-Text Model

---

## Branch

- `main` : 최종 통합 코드
- `frontend` : Frontend 작업
- `backend` : Backend 작업
- `ai` : AI 작업

각 파트에서 작업 후 Pull Request를 통해 `main` 브랜치에 병합합니다.

---

## Status

🚧 Capstone Project in Progress
