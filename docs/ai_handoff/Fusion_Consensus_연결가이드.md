# PinPoint Fusion·Consensus 코드 연결 가이드

> 작성 기준: 2026-10-12
>
> 근거: `00_분석자료/54_Fusion_Consensus_연결구조.json`
>
> 상태: 정적 분석 완료 / 전체 통합 실행 미검증

---

## 1. 이 문서의 목적

PinPoint AI에서 사용하는 다음 구성요소의 역할과 연결 방식을 설명한다.

- Visual Moment-DETR
- Hybrid 구간 보정
- 한국어 MiniLM 자막 검색
- 영어 MiniLM 자막 검색
- Fusion 후보 결합
- Consensus V1/V2/V3 재정렬

서로 다른 실험의 후보 생성 방식과 순위 결정 방식을
혼동하지 않도록 구분한다.

## 2. 실제 코드 기준 함수 인터페이스

### Moment-DETR 기본 추론

```python
def predict_moments(
    video_id,
    video_feature_path,
    query,
    video_duration=None,
    top_k=5,
    iou_threshold=0.5
)
```

반환 후보에는 video_id, query, start_time, end_time, score가
포함된다. 50단계에서 영어 질의의 실제 Top-3 구간 반환에 성공했다.

### Moment-DETR Hybrid 추론

```python
def predict_moments_hybrid(
    video_id,
    video_feature_path,
    query,
    subtitle_json_path=None,
    video_duration=None,
    top_k=5,
    iou_threshold=0.5,
    min_start_gap=8.0
)
```

Moment-DETR이 후보를 생성한 후, 각 후보 내부에서
자막 또는 영상 특징으로 시작 시점을 보정하는 방식이다.

현재 인수인계 환경에서 Hybrid 함수 전체 실행은
별도로 검증하지 않았다.

### Fusion

```python
def predict_moments_fusion(
    video_id, feature_path, subtitles,
    korean_query, english_query,
    video_duration, subtitle_json_path=None, top_k=5,
    model_type="base"
)
```

- `korean_query`: 한국어 질의
- `english_query`: 영어 질의
- `subtitles`: 자막 의미 검색 입력
- `subtitle_json_path`: Hybrid 보정에서 활용하는 자막 경로
- `model_type`: `base` 또는 `finetuned`

Fusion은 Hybrid 후보, KO 후보, EN 후보를 번갈아 선택하고
IoU 0.5 이상 겹치는 후보를 제거하는 방식이다.

MiniLM Fine-tuned 모델을 사용하려면
`PINPOINT_MINILM_MODEL_PATH` 환경변수가 필요하다.

### Consensus V1

```python
def rank_by_consensus(hybrid, ko, en)
```

### Consensus V2

```python
def rank_by_consensus_v2(hybrid, ko, en)
```

V1은 min_overlap=0.0, V2는 min_overlap=0.5를 사용한다.
다만 코드상의 상세 점수 계산은 원본 파일을 참조한다.

### Consensus V3

```python
def rank_by_consensus_v3(visual, ko, en, overlap_threshold=0.5)
```

각 그룹에서 상위 3개 후보를 가져와 원래 순위 점수와
다른 모델의 시간 겹침을 이용한 합의 점수를 계산한다.

출력 후보에는 consensus_score 등 재정렬 관련 값이 포함된다.

## 3. 올바른 비교 구조

다음 세 후보 그룹을 먼저 별도로 보관한다.

```text
Visual 또는 Hybrid 후보
MiniLM-KO 후보
MiniLM-EN 후보
        |
        +---- Fusion ----> Fusion Top-K
        |
        +---- Consensus V2 ----> V2 Top-K
        |
        +---- Consensus V3 ----> V3 Top-K
```

단, V1/V2와 V3의 후보 원천을 일치시켜야
공정한 비교가 가능하다.

특히 기존 6개 동일 후보 비교에서
V1/V2의 hybrid 표기 후보가 실제로는
Visual Moment-DETR 후보였던 사례를 확인했다.

Fusion의 최종 결과 리스트 하나를 그대로
Consensus V3에 전달하면 안 된다.

Consensus V3는 visual, ko, en 세 개의 분리된
후보 리스트를 입력받도록 설계되어 있다.

## 4. 후보 데이터 형식 주의사항

공통 필드:

- `start_time`: 구간 시작 시각, 초
- `end_time`: 구간 종료 시각, 초
- `score`: 모델별 원래 관련도 점수. 없거나 None일 수 있음
- `source`: 후보 생성 방식 식별용으로 활용될 수 있음

추가 필드:

- Fusion: source, hybrid_source, visual_score,
  subtitle_score, language
- Consensus V3: rank_source, original_rank,
  rank_score, consensus_score 등

모델별 score는 생성 방식이 다르므로
동일한 확률값이라고 가정하면 안 된다.

또한 후보 그룹 순서는 V3가 사용하는 상위 3개를
결정하므로 재정렬 이전의 순위를 보존해야 한다.

## 5. GitHub 연동 시 주의점

현재 검토한 GitHub 커밋:

`14b3eb9f6fca4eef2df258d860e32bd23ca13da9`

- 현재 Moment-DETR 기본 함수는 실제 영어 질의 추론 성공
- Hybrid는 정적 코드 인터페이스 확인
- Fusion은 `ai.features.run_moment_detr_inference`에 의존
- Consensus V1/V2는 `ai.features.fusion_search`를 import함
- 현재 GitHub의 `ai/features/fusion_search.py`는
  36단계 구조 조사에서 확인되지 않음
- Consensus V3는 현재 코드상 외부 import가 없음

따라서 V1/V2, Fusion을 GitHub에 연결하려면
실제 모듈 경로와 입력 스키마 확인이 필요하다.

인수인계된 Fusion 파일을 이름만 바꿔 덮어쓰거나
검증하지 않은 경로로 이동시키는 것은 피한다.

## 6. 기존 실험에서 확인된 성능

동일 후보 기반 6개 탐색적 사례:

| 지표 | V1 | V2 | V3 |
|---|---:|---:|---:|
| Mean Top-1 IoU | 0.4463 | 0.4463 | 0.4463 |
| Mean Best-5 IoU | 0.6166 | 0.6806 | 0.6806 |
| R1@0.5 | 3/6 | 3/6 | 3/6 |
| R5@0.5 | 4/6 | 5/6 | 5/6 |

이 결과로 V3가 V2보다 우수하다고 주장할 수 없다.

MiniLM Fine-tuning도 기존 6개 Fusion 질의에서
Top-1 IoU 개선이 확인되지 않았다.

이 실험은 독립 대규모 평가가 아니라
탐색적 사례 분석이다.

## 7. 후속 담당자 권장 연결 순서

1. GitHub의 `predict_moments()` 정상 추론 재현
2. 동일 영상·질의에 대해 Hybrid 후보 생성 확인
3. MiniLM-KO와 MiniLM-EN 후보를 별도로 저장
4. 모든 후보의 start_time/end_time, source, score 확인
5. 동일 후보 집합을 사용해 Fusion과 Consensus 비교
6. Top-1 IoU, Best-5 IoU, R1@0.5, R5@0.5 평가
7. 학습 영상 ID와 중복되지 않는 평가셋으로 검증
8. 최종 후보 선택 방식을 서비스 API에 연결

## 8. 아직 해결되지 않은 문제

- Fusion / Hybrid / Consensus 통합 실행 미검증
- GitHub에 없는 기존 모듈 경로 정리 필요
- CLIP 사전학습 가중치의 새 환경 확보 방법 확인 필요
- 한국어 질의의 성능 및 번역 방식 비교 필요
- MiniLM 학습 데이터와 후보 Val/Test 영상 ID 중복
- AI-Hub 원본 및 파생 데이터의 공유 조건 확인
- End-to-End 서비스 API 연결 미검증

## 9. 관련 문서

- `README_먼저읽어주세요.md`
- `전체_AI_실험_진행내역.md`
- `학습_및_추론_실행가이드.md`
- `00_분석자료/54_Fusion_Consensus_연결구조.json`

이 문서는 실제 코드의 인터페이스를 근거로 작성했지만,
Fusion·Consensus 전체 실행이 성공했다는 뜻은 아니다.
