cat > docs/backend-setup.md << 'EOF'
# 백엔드 로컬 실행 가이드

> 기준: Python 3.10 / Windows(Git Bash) / NVIDIA GPU(CUDA 12.6) 권장

## 0. 준비물
- Python 3.10, Git, [ffmpeg](https://ffmpeg.org) (`ffmpeg -version`이 되어야 함)
- Supabase 프로젝트 키, YouTube Data API 키 (팀 채널에서 받기)
- MiniLM `final_model` 폴더 (한국어 자막 검색용, 아래 3번)

## 1. 가상환경과 패키지
프로젝트 루트에서:

    python -m venv venv
    source venv/Scripts/activate        # 프롬프트 앞에 (venv)가 보여야 함

GPU가 있으면 torch를 먼저 설치:

    pip install torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cu126

(GPU가 없으면: `pip install torch torchvision`)

그 다음:

    pip install -r backend/requirements.txt

## 2. 환경변수
`backend/.env.example`을 복사해서 `backend/.env`를 만들고 값을 채웁니다. (`.env`는 절대 커밋하지 마세요)

    cp backend/.env.example backend/.env

## 3. MiniLM 모델
한국어 자막 검색은 파인튜닝된 MiniLM(`final_model`)을 사용합니다.
폴더를 받은 뒤 `backend/.env`의 `PINPOINT_MINILM_MODEL_PATH`에 절대 경로를 적습니다.
(예: `D:/pinpoint-models/minilm_ko`) 폴더 안에 `model.safetensors`, `config.json` 등이 있어야 합니다.

## 4. 서버 실행
프로젝트 루트에서 (venv 켠 상태):

    uvicorn backend.main:app --reload

`Application startup complete`가 보이면 완료.
- API 문서/테스트: http://127.0.0.1:8000/docs
- 첫 실행은 모델을 내려받고 올리느라 시간이 걸립니다. 이후 검색은 빠릅니다.

## 5. 동작 방식 요약
1. 유튜브 영상을 검색해서 `POST /api/search`로 질문하면, 처음 보는 영상은 분석을 시작합니다 (202 PROCESSING).
2. 분석 = 영상 다운로드 → CLIP 특징 추출 → 한국어 음성 자막 생성(Whisper) → 저장.
3. 분석이 끝나면(INDEXED) 같은 요청에 구간 결과가 나옵니다.
4. 한국어 자막이 있으면 자막 검색(MiniLM)을 먼저 하고, 유사도가 낮거나 자막이 없으면 영상 검색(Moment-DETR)으로 대체합니다.
5. 분석 상태 확인: `GET /api/videos/youtube/{id}/status`

자세한 API는 `docs/api-spec.md`를 참고하세요.

## 6. 자주 나는 문제
| 증상 | 해결 |
|---|---|
| `uvicorn: command not found`, `No module named 'torch'` | venv가 꺼져 있음. `source venv/Scripts/activate` |
| `supabase_url is required` | `backend/.env`가 없거나 값이 비어 있음 |
| `ffmpeg not found` | ffmpeg 설치 후 PATH 등록, 터미널 재시작 |
| 한국어 영상인데 자막 검색이 안 됨 | `data/processed/subtitles/{영상ID}.json` 존재 여부 확인. 없으면 `python -m backend.services.indexer subs {영상ID}` |
| 프론트에서 CORS 에러 | `backend/.env`의 `CORS_ORIGINS`에 프론트 주소 추가 후 서버 재시작 |
| 영상 다운로드 실패 | `pip install -U yt-dlp`로 업데이트 |
| 로그인 직후 인증 에러 | Supabase 대시보드에서 Confirm email이 꺼져 있는지 확인 |

## 7. 지금 알려진 제한
- 영상 길이 30분 초과는 분석하지 않습니다 (`TOO_LONG`).
- 유튜브 검색 API는 하루 호출 한도가 있습니다 (검색 1회 = 100 units, 하루 10,000).
- 영상 분석은 GPU 서버가 필요해서, 클라우드 배포 없이 로컬 서버로 실행합니다.
EOF