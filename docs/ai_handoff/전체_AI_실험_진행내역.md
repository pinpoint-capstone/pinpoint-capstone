# PinPoint AI 전체 실험 진행 내역

> 정리 기준: 2026-10-12
>
> 성격: 후속 AI 담당자 인수인계용 실험 기록
>
> 주의: 실험 순서에 따른 기술적 발전 과정이며,
> 모든 방식이 독립 테스트셋에서 검증된 것은 아님.

---

## 1. 프로젝트 목적

PinPoint는 자연어 검색어를 이용해 영상 내부에서
관련 장면의 시작·종료 시점을 찾는 서비스다.

예시:
- 입력: "두부를 칼로 자르는 장면"
- 모델 출력: 관련 영상 구간의 start_time, end_time, score
- 서비스: 선택한 구간의 시작 시점부터 재생

영상 자체의 관련성을 검색하는 문제와,
영상 내부의 정확한 시간 구간을 찾는 문제를 구분해야 한다.

## 2. 초기 기반 모델 — Moment-DETR

### 선택 이유

Moment-DETR은 자연어 질의와 영상 특징을 받아
관련 시간 구간을 예측하는 모델이다.

PinPoint의 최종 목표인 자연어 기반 영상 구간 검색과
문제 정의가 가깝기 때문에 기본 모델로 채택했다.

### 주요 입력과 처리

- 원본 MP4에서 영상 특징 추출
- CLIP 영상 특징 생성
- Query를 CLIP 텍스트 특징으로 변환
- Moment-DETR 추론
- 후보 시간 구간과 점수 출력

과거 실험에서는 2초 간격 영상 특징과 TEF를 이용했다.

현재 GitHub 기준 함수:
- `ai/features/run_moment_detr_inference.py`
- `predict_moments`
- `predict_moments_hybrid`

Moment-DETR 원본 구현:
- `ai/vendor/moment_detr/`

검토한 GitHub 커밋:
`14b3eb9f6fca4eef2df258d860e32bd23ca13da9`

### QVHighlights 기반 학습

QVHighlights를 이용한 Moment-DETR 학습 실험이 있었다.

기존 기록상의 비교:
- 자체 Scratch 모델 R1@0.5: 53.18
- 공개 모델 R1@0.5: 54.28
- 자체 Scratch 모델 mAP: 29.89
- 공개 모델 mAP: 31.29

위 수치는 퍼센트 단위 평가 결과로 기록된 값이다.
동일 데이터와 평가 설정의 재현 검증 없이
다른 한국어 영상 평가와 직접 비교하면 안 된다.

## 3. 한국어 검색 보완 — MiniLM 및 Fusion

### 문제 인식

기존 Moment-DETR의 CLIP 텍스트 인코딩만으로는
한국어 질의를 충분히 다루기 어려웠다.

한국어 영상에서 자막 정보를 활용하기 위해
MiniLM 기반 의미 검색을 추가했다.

### 기본 모델

`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`

실험 구성:
- Visual Moment-DETR 후보
- 한국어 자막 기반 MiniLM 후보
- 영어 자막 또는 번역 질의 기반 MiniLM 후보
- 후보 결합, 중복 제거 및 재정렬

Fusion 코드에는 이전 버전과 최종 복원 버전이 공존한다.
파일명에 FINAL이 있어도 서비스 전체 통합 실행을
검증했다는 의미는 아니다.

## 4. MiniLM Fine-tuning

### 학습 목적

한국어 영상의 설명(Summary)과 발화 내용(Transcript)이
서로 가깝게 임베딩되도록 학습했다.

### 학습 방식

- 학습 손실: MultipleNegativesRankingLoss
- Epoch: 1
- Batch size: 8
- Gradient accumulation: 2
- Learning rate: 2e-5
- Warmup ratio: 0.1
- Seed: 42

구체적인 실행 인자와 실제 환경은
`minilm_train_restored_20261010.py`를 기준으로 재확인한다.

### 학습 데이터

- 원본 Train pairs: 15,823개
- 정리된 Train pairs: 15,502개
- Validation pairs: 1,948개

Train과 Validation의 video_id 중복은 발견되지 않았다.

### 전체 Validation 성능

평가: AI-Hub Summary–Transcript 검색, 1,948개

| 지표 | 기본 MiniLM | Fine-tuned MiniLM |
|---|---:|---:|
| Recall@1 | 51.03% | 75.15% |
| Recall@5 | 65.55% | 85.88% |
| MRR | 0.5773 | 0.7996 |

결론:
텍스트 쌍 검색 과제에서는 Fine-tuning 후 개선이 확인됐다.

그러나 이 결과는 영상 내 시간 구간 탐색 성능을
직접 평가한 결과가 아니다.

## 5. Fine-tuned MiniLM의 실제 Fusion 적용

동일한 6개 사례에서 기존 Fusion과
Fine-tuned MiniLM 기반 Fusion을 비교했다.

| 지표 | 기존 Fusion | Fine-tuning Fusion |
|---|---:|---:|
| Mean Top-1 IoU | 0.2540 | 0.2540 |
| Mean Best-5 IoU | 0.5883 | 0.5837 |
| R1@0.5 | 16.67% | 16.67% |
| R5@0.5 | 66.67% | 66.67% |

사례별 결과:
- 두부 자르기: Fine-tuned Fusion의 Best-5 IoU 악화
- 다이소 시트 세제: Fine-tuned Fusion의 Best-5 IoU 개선
- 전체 Top-1 성능: 변화 없음

결론:
MiniLM의 텍스트 검색 성능 상승이
Fusion 영상 구간 검색의 일관된 상승으로 이어지지 않았다.

6개 사례만으로 일반화 성능을 확정할 수 없다.

## 6. Consensus V1 / V2 / V3

### 실험 목적

Moment-DETR, 한국어 MiniLM, 영어 MiniLM이
같은 시간 구간을 지목할 때 해당 후보에 가점을 주어
최종 순위를 개선하려고 했다.

### 버전별 개념

**V1**
- 시간적으로 겹치는 후보를 이용한 합의 점수
- 겹침 허용 기준이 상대적으로 느슨함

**V2**
- 후보 겹침 판단에 IoU 0.5 기준 적용

**V3**
- Visual / KO / EN 각각 상위 3개 후보 사용
- 후보 순위 기반 점수와 모델 간 합의 보너스 결합
- 서로 다른 후보 구간을 실제로 병합하지는 않음

### 동일 후보 기반 6개 사례 평가

| 지표 | V1 | V2 | V3 |
|---|---:|---:|---:|
| Mean Top-1 IoU | 0.4463 | 0.4463 | 0.4463 |
| Mean Best-5 IoU | 0.6166 | 0.6806 | 0.6806 |
| R1@0.5 | 3/6 | 3/6 | 3/6 |
| R5@0.5 | 4/6 | 5/6 | 5/6 |

주의:
이 비교에서 V1/V2의 일부 후보가 hybrid라고
표기되어 있어도, 동일 후보 비교에서는 실제
Visual Moment-DETR 후보를 사용했다는 점을 확인했다.

결론:
V2와 V3의 Top-1 및 Best-5 성능이 동일했다.
따라서 해당 결과만으로 V3가 V2보다
성능이 우수하다고 주장할 수 없다.

### V3 실패 사례

- 두부 자르기: Top-1 IoU 0
- 두부 양념 준비: Top-1 IoU 약 0.435
- 다이소 시트 세제: Top-1 IoU 약 0.134

세 사례 모두 전체 후보 집합에는
IoU 0.5 이상 후보가 존재했다.

즉, 올바른 구간을 전혀 발견하지 못했다기보다
올바른 후보를 최상위로 올리지 못한 순위 결정 문제였다.

## 7. Multilingual CLIP 프레임 검색 실험

### 목적

한국어 질의를 영어로 번역하지 않고,
한국어 텍스트 임베딩으로 영상 프레임 특징을 검색하는
방식을 시험했다.

모델:
`sentence-transformers/clip-ViT-B-32-multilingual-v1`

실험 구성:
- 한국어 질의 → 512차원 임베딩
- 기존 영상 CLIP 특징과 코사인 유사도 비교
- 프레임 단위 Top-K 검색
- 프레임 인덱스를 약 2초 간격 시점으로 대응

### 6개 사례 결과

| 모델 | Top-1 프레임 point-hit | Top-5 프레임 point-hit |
|---|---:|---:|
| 영어 CLIP | 3/6 | 5/6 |
| Multilingual CLIP | 2/6 | 5/6 |

이 지표는 정답 시간 구간 안에 검색 프레임이 들어가는지를
판정한 것이다. Moment-DETR의 시간 구간 IoU와
직접 비교할 수 없다.

또한 이 실험은 Multilingual CLIP을
Moment-DETR의 텍스트 인코더로 실제 교체해
성능 향상을 검증한 실험이 아니다.

### 독립 모델 복구 및 로딩

인수인계 단계에서 Hugging Face 캐시의 경로 파일 문제를
발견해 실제 가중치로 복구했다.

확인 사항:
- 본 모델 약 514 MiB
- Dense 가중치 약 1.5 MiB
- SentenceTransformer 로딩 성공
- 한국어 문장 3개 → (3,512) 임베딩 생성
- NaN·무한대 없음
- L2 정규화 확인

인수인계 모델 위치:
`03_학습모델_체크포인트/Multilingual_CLIP/`

## 8. 데이터 분할 및 평가상 주의사항

MiniLM Fine-tuning에 사용된 clean train의
video_id는 15,502개였다.

기존 한국어 candidate 데이터와의 ID 중복:

| Candidate 데이터 | 전체 video_id | MiniLM clean train과 중복 |
|---|---:|---:|
| Train | 14,216 | 12,330 |
| Val | 1,777 | 1,518 |
| Test | 1,777 | 1,534 |

이는 중요한 평가 설계 문제다.

기존 candidate Val/Test를 그대로 사용해
Fine-tuned MiniLM의 미관측 영상 일반화 성능을
평가했다고 주장하면 안 된다.

또한 앞선 6개 영상 질의 실험은
독립된 대규모 테스트가 아닌 탐색적 실험으로 구분한다.

## 9. 현재까지의 종합 결론

1. Moment-DETR은 영상 구간 후보를 생성하는 기본 구조다.
2. MiniLM Fine-tuning으로 텍스트 검색 성능은 개선됐다.
3. 그러나 Fusion 영상 검색에서는 일관된 개선을 확인하지 못했다.
4. Consensus V3도 동일 후보 실험에서 V2보다 우수하지 않았다.
5. Multilingual CLIP은 한국어 프레임 검색에 활용할 수 있는
   실험 모델이며, 독립 로딩 검증을 완료했다.
6. 최종 서비스 통합과 독립 데이터셋 일반화 성능은
   추가 검증이 필요하다.

## 10. 후속 담당자 권장 실험

우선순위 A — 평가 기반 정리:
- 영상 ID 기준으로 Train/Val/Test 재분할
- 평가 사례 및 Ground Truth 작성 근거 명시
- 동일 후보·동일 질의·동일 지표로 모델 간 비교

우선순위 B — 후보와 재정렬 분리:
- Moment-DETR 후보 자체의 Recall/Oracle 성능 측정
- 한국어·영어 자막 후보의 Recall/Oracle 성능 측정
- 후보 결합 전후 Top-1 및 Top-5 변화 분석

우선순위 C — 언어 대응:
- 한국어 질의·자막을 영어로 번역하는 방식 검토
- 한국어 MiniLM / Fine-tuned MiniLM 비교 유지
- Multilingual CLIP은 프레임 검색 실험과
  시간 구간 검색 통합 실험을 구분

우선순위 D — 서비스 통합:
- GitHub의 기본 Moment-DETR 함수 실행 재현
- 모델·자막·영상 특징 경로 연결
- API가 반환할 start_time/end_time/score 계약 확인
- 긴 영상의 처리 시간과 캐시 전략 점검

---

## 11. 관련 자료 위치

- 메인 안내: `README_먼저읽어주세요.md`
- 전체 파일 현황: `00_176개_인수인계진행현황.csv`
- 코드: `01_실행코드/`
- 학습 데이터: `02_학습데이터/`
- 모델: `03_학습모델_체크포인트/`
- 실험 결과: `04_실험결과_및_성능비교/`
- 원본 접근 제한 목록: `00_분석자료/32_공유권한_확인목록.csv`
- 코드 의존성 기록: `00_분석자료/33_실행코드_의존성점검.json`

이 문서는 지금까지 확인된 실험 결과를 정리한 것이며,
새로운 실험에서 성능이 재현되었다는 뜻은 아니다.
