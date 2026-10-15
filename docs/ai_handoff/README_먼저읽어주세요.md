# PinPoint AI 인수인계 안내서

> 작성 기준: 2026-10-12
>
> 상태: 인수인계 준비 중 / 코드 전체 실행 및 데이터 공유 승인 미완료
>
> 이 문서는 현재까지의 실험 결과와 확인된 자료를 기반으로 작성한 초안입니다.

---

## 1. 프로젝트 소개

PinPoint는 사용자가 자연어로 검색하면 영상 내부에서 관련 장면의
시작·종료 구간을 찾아 해당 시점부터 재생하도록 하는 서비스입니다.

예시:

- 입력: "두부를 칼로 자르는 장면"
- 출력: 검색어와 관련된 영상 후보, start_time, end_time
- 사용자 기능: 원하는 검색 결과 클릭 후 해당 시점부터 영상 재생

본 인수인계는 AI 영상 구간 검색 및 관련 실험에 관한 것입니다.

## 2. 반드시 함께 사용해야 하는 GitHub 저장소

저장소:

https://github.com/pinpoint-capstone/pinpoint-capstone

검토한 브랜치: main

검토한 커밋:

`14b3eb9f6fca4eef2df258d860e32bd23ca13da9`

재현 시 가능한 한 이 커밋을 기준으로 사용하십시오.

```bash
git clone https://github.com/pinpoint-capstone/pinpoint-capstone.git
cd pinpoint-capstone
git checkout 14b3eb9f6fca4eef2df258d860e32bd23ca13da9
```

현재 확인한 핵심 코드:

- `ai/features/run_moment_detr_inference.py`
  - `predict_moments`
  - `predict_moments_hybrid`
- `ai/features/prepare_moment_detr_input.py`
- `ai/preprocessing/pipeline.py`
- `ai/vendor/moment_detr/`

현재 GitHub 구조에서 예전 `search_api.py`, `indexer.py` 등의
예상 경로는 확인되지 않았습니다. 백업된 이전 버전을
현재 서비스의 최신 구현으로 간주하지 마십시오.

## 3. 인수인계 폴더 구성

- `01_실행코드/`: 실험·학습·평가용 Python 코드 및 노트북
- `02_학습데이터/`: 학습용 파생 데이터와 분할 자료
- `03_학습모델_체크포인트/`: Moment-DETR 및 MiniLM 모델,
  독립 보관된 Multilingual CLIP
- `04_실험결과_및_성능비교/`: 원본 실험 결과 및 공개용 결과
- `05_테스트영상_및_자막/`: 권한 확인이 끝난 자료 및 영상 특징
- `06_실행환경_및_설치방법/`: 관련 문서
- `00_분석자료/`: 파일 조사, 복사 검증 및 작업 기록

실제 파일들은 원본 출처 추적과 파일명 충돌 방지를 위해
위 폴더 안에서 기존 소스별 하위 경로를 유지합니다.

## 4. 176개 원본 파일 관리 현황

- 전체 추적: 176개
- 복사 및 SHA-256 검증 완료: 109개
- 독립 Multilingual CLIP 스냅샷 구성에 대응: 13개
- 모델 캐시 원본 보존·검토: 41개
- Python 캐시 원본 보존: 2개
- 공유 권한 확인 필요: 11개

참고:

- `00_176개_인수인계진행현황.csv`
- `00_전체176개_파일관리대장.csv`

모든 파일이 인수인계 폴더에 물리적으로 복사된 것은 아닙니다.
복사된 파일도 모두 공유 허가가 확정된 것은 아닙니다.

## 5. AI 모델 및 실험 흐름

### 5.1 Moment-DETR

영상 CLIP 특징과 자연어 Query를 이용해 관련 시간 구간을 예측합니다.

현재 PinPoint GitHub에서 기본 예측 함수와 Hybrid 예측 함수를
확인했습니다.

### 5.2 MiniLM 기반 자막 검색

기본 모델:

`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`

AI-Hub 한국어 Summary–Transcript 쌍으로 Fine-tuning했습니다.

검증 데이터 1,948개 기준:

| 지표 | 기본 모델 | Fine-tuned |
|---|---:|---:|
| Recall@1 | 0.5103 | 0.7515 |
| Recall@5 | 0.6555 | 0.8588 |
| MRR | 0.5773 | 0.7996 |

이는 텍스트 검색 성능입니다.
영상 시간 구간 검색의 개선을 직접 입증하지는 않습니다.

6개 영상 질의에 대한 기존 Fusion / Fine-tuned Fusion 비교에서는:

- 평균 Top-1 IoU: 0.2540 / 0.2540
- R1@0.5: 16.67% / 16.67%
- R5@0.5: 66.67% / 66.67%

따라서 Fine-tuning이 실제 영상 검색을 일관되게 개선했다고
단정할 수 없습니다.

### 5.3 Consensus V1 / V2 / V3

Visual Moment-DETR, 한국어 MiniLM, 영어 MiniLM 후보를
비교하고 겹치는 구간에 가점을 주는 방식입니다.

동일 후보 기반 6개 사례 평가에서:

- V1 평균 Top-1 IoU: 0.4463
- V2 평균 Top-1 IoU: 0.4463
- V3 평균 Top-1 IoU: 0.4463
- V2와 V3의 R5@0.5: 모두 5/6

따라서 이 실험에서는 V3가 V2보다 우수하다고 확인되지 않았습니다.

이 6개 사례는 독립된 대규모 테스트셋이 아니며,
이미 검토한 개발 사례라는 한계가 있습니다.

### 5.4 Multilingual CLIP

모델:

`sentence-transformers/clip-ViT-B-32-multilingual-v1`

독립 모델 위치:

`03_학습모델_체크포인트/Multilingual_CLIP/`

검증된 사항:

- 모델 폴더 단독 로딩 성공
- 한국어 검색어 3개 인코딩 성공
- 512차원 임베딩 생성
- NaN·무한대 없음
- L2 정규화 정상

주의:

이는 텍스트 인코더 실행 검증입니다.
프레임 검색 실험은 별도로 평가됐으며,
Moment-DETR의 시간 구간 검색 성능 향상을 의미하지 않습니다.

## 6. 학습 데이터 사용 시 중요한 주의사항

MiniLM 학습에 사용한 clean train 데이터는 15,502개
고유 video_id로 구성되어 있습니다.

기존 한국어 영상 후보 데이터와 비교하면:

- candidates_train: 학습 ID 중복 12,330개
- candidates_val: 학습 ID 중복 1,518개
- candidates_test: 학습 ID 중복 1,534개

따라서 기존 candidates_val/test를 Fine-tuned MiniLM의
독립적인 미관측 영상 평가셋으로 사용해서는 안 됩니다.

평가용 데이터를 다시 구성할 때는
영상 ID 기준으로 학습·검증·테스트 중복을 제거하십시오.

## 7. 공유 권한 주의

복사 보류된 원본:

- AI-Hub TAR: 2개
- 테스트 MP4: 4개
- 영상 자막 JSON: 4개
- Ground Truth JSON: 1개

확인 목록:

`00_분석자료/32_공유권한_확인목록.csv`

AI-Hub 원본뿐 아니라 이를 이용해 생성한
학습 JSONL 및 후보 데이터도 이용 조건 확인이 필요합니다.

복사 완료는 팀원 공유 승인과 동일하지 않습니다.
권한 확인 전에는 외부 또는 팀원에게 일괄 재배포하지 마십시오.

## 8. 아직 검증되지 않은 부분

- GitHub와 백업된 Fusion·Consensus 코드의 통합 실행
- 전체 영상 업로드 → 전처리 → 구간 검색의 End-to-End 실행
- MiniLM 추가 학습의 현재 환경 재현성
- Moment-DETR 체크포인트의 현재 환경 로딩 재검증
- 서비스 API와 검색 결과 스키마 연결
- 전체 데이터의 공유·재배포 허가

노트북 및 코드에는 이전 개발 버전이 포함되어 있으며,
정적 import 분석만으로 실행 성공을 보증할 수 없습니다.

## 9. 다음 담당자 권장 진행 순서

1. 위 GitHub 커밋을 기준으로 저장소 확보
2. 본 폴더의 코드, 모델, 데이터와 GitHub 구조 연결
3. 의존성 및 환경변수 확인
4. MiniLM 텍스트 검색과 기본 Moment-DETR 추론을 각각 재현
5. Fusion 및 Consensus를 동일 입력에서 비교
6. 새로운 영상 ID 분할로 독립 평가 수행
7. 검색 API와 최종 start_time 출력 연동

## 10. 주요 검증 기록

- `00_분석자료/20_공개용JSON_보존검증.json`
- `00_분석자료/24_1차복사_검증결과.json`
- `00_분석자료/26_MultilingualCLIP_복사검증.json`
- `00_분석자료/29_MultilingualCLIP_가중치복구.json`
- `00_분석자료/33_실행코드_의존성점검.json`
- `00_분석자료/34_GitHub코드_의존성확인.json`
- `00_분석자료/36_GitHub_AI코드구조_점검.json`

---

이 README는 현재 확인된 사실만 정리한 첫 번째 초안입니다.
최종 인수인계 전 실행 환경, 상세 코드 설명, 공유 조건을
추가 확인해야 합니다.


---

## Moment-DETR 실제 추론 검증 (2026-10-12)

PinPoint의 GitHub Moment-DETR 모델과 인수인계된 체크포인트,
다이소 영상 특징을 연결하여 **실제 Top-3 시간 구간 반환에 성공**했다.

- 입력 질의: `a person showing a product`
- Top-1: 29.1629~31.9672초, score 0.9626
- 실행: CPU / 영어 질의 1개 / 영상 길이 32초 추정
- 방식: 제한적 안전 로딩 후 메모리에서 GitHub 모델 함수 연결

**검증 범위는 추론 정상 동작까지이며 정답 정확도, 한국어 질의,
Fusion 및 서비스 통합 성능은 검증하지 않았다.**

상세 기록: `학습_및_추론_실행가이드.md` 16절
