# PinPoint 검색 API 명세 (v0.2)

## 공통 안내
- 개발 서버 주소: `http://127.0.0.1:8000` (서버를 켜면 `/docs`에서 직접 호출해 볼 수 있어요)
- **로그인**: 검색 관련 API(`/api/youtube/search`, `/api/search`, `/api/search/multi`, 상태 확인)는 로그인 없이 호출할 수 있어요. `Authorization: Bearer 토큰`을 같이 보내면 검색 기록이 저장돼요. 즐겨찾기 API만 로그인이 필수예요.
- **ID 구분**
  - 검색 API에 보내는 값은 `youtube_video_id`(유튜브 11자리 ID)예요.
  - 응답의 `video.video_id`는 DB 내부 uuid예요.
  - 즐겨찾기 API(`POST /api/users/me/favorites`)의 `video_id`는 내부 uuid이니, 검색 응답의 `video.video_id`를 그대로 넣어 주세요.

## 흐름
1. 프론트가 `GET /api/youtube/search`로 영상 목록 조회
2. **영상 하나를 골라 검색**: 사용자가 영상 클릭 → `POST /api/search`
   - 이미 분석된 영상이면 바로 결과(200), 처음 보는 영상이면 분석 시작(202)
   - 202면 `GET .../status`를 2~3초마다 확인
   - `INDEXED`가 되면 `POST /api/search`를 다시 호출 → 결과(200)
3. **여러 영상을 한 번에 검색**: 화면의 영상 목록과 검색어로 `POST /api/search/multi` 호출
   - 분석된 영상은 구간 결과가 오고, 분석 안 된 영상은 `pending`에 담겨 와요.
   - `pending` 영상은 사용자가 클릭할 때 2번 방식으로 분석을 시작해요.
4. 프론트가 `start_time`으로 유튜브 플레이어 seek

## 1. 유튜브 영상 검색
`GET /api/youtube/search?q=손흥민 골&max_results=5`

응답 200
```json
{
  "items": [
    {
      "youtube_video_id": "Ps8FeqKyFoM",
      "title": "영상 제목",
      "channel_name": "채널명",
      "thumbnail_url": "https://i.ytimg.com/vi/Ps8FeqKyFoM/mqdefault.jpg",
      "published_at": "2026-10-07T12:00:00Z"
    }
  ]
}
```

## 2. 장면 검색 (영상 1개)
`POST /api/search`

요청
```json
{
  "youtube_video_id": "Ps8FeqKyFoM",
  "query": "골 넣고 세리머니하는 장면",
  "top_k": 5
}
```
`top_k`는 선택(기본 5, 최대 10)이고, URL은 백엔드가 만들어서 보내지 않아도 돼요.

응답 200 (분석 완료, 결과 있음)
```json
{
  "status": "INDEXED",
  "video": {
    "video_id": "내부 uuid",
    "youtube_video_id": "Ps8FeqKyFoM",
    "title": "영상 제목",
    "thumbnail_url": "https://..."
  },
  "query": "골 넣고 세리머니하는 장면",
  "results": [
    {
      "segment_id": "Ps8FeqKyFoM-1",
      "start_time": 132.4,
      "end_time": 145.0,
      "score": 0.87
    }
  ]
}
```
`results`는 점수 높은 순이고, 시간은 초 단위(소수 가능)예요. `score`는 0~1 범위예요.

응답 202 (처음 보는 영상, 분석 시작됨)
```json
{
  "status": "PROCESSING",
  "youtube_video_id": "Ps8FeqKyFoM",
  "message": "영상을 분석 중입니다."
}
```
분석에는 영상 1분당 수십 초가 걸려요. 서버가 켜진 직후에도 모델을 미리 올려 두기 때문에 검색 자체는 1초 안팎이에요.

## 3. 분석 상태 확인
`GET /api/videos/youtube/{youtube_video_id}/status`

```json
{
  "youtube_video_id": "Ps8FeqKyFoM",
  "status": "PROCESSING",
  "error_message": null
}
```
`status`는 `PENDING` / `PROCESSING` / `INDEXED` / `FAILED` 중 하나예요. 다운로드나 분석이 실패하면 `FAILED`가 되고 `error_message`에 사유가 들어가요. 등록되지 않은 영상이면 404(`VIDEO_NOT_FOUND`)예요.

## 4. 다중 장면 검색 (분석 완료된 영상만)
`POST /api/search/multi`

요청
```json
{
  "query": "골 세리머니",
  "youtube_video_ids": ["Ps8FeqKyFoM", "a6Nw3y07Zs8"],
  "top_k_per_video": 3,
  "max_videos": 10
}
```
- `youtube_video_ids`는 선택이에요. 생략하면 분석 완료된 영상 전체가 대상이에요. (최대 20개)
- `top_k_per_video`는 1~5(기본 3), `max_videos`는 1~10(기본 10)이에요.

응답 200
```json
{
  "query": "골 세리머니",
  "videos": [
    {
      "video": {
        "video_id": "내부 uuid",
        "youtube_video_id": "Ps8FeqKyFoM",
        "title": "영상 제목",
        "channel_name": "채널명",
        "thumbnail_url": "https://..."
      },
      "best_score": 0.9,
      "moments": [
        { "segment_id": "Ps8FeqKyFoM-1", "start_time": 132.4, "end_time": 145.0, "score": 0.9 }
      ]
    }
  ],
  "pending": [
    { "youtube_video_id": "a6Nw3y07Zs8", "status": "NOT_ANALYZED" }
  ]
}
```
- `videos`는 `best_score` 높은 순이고, 분석이 끝난(`INDEXED`) 영상만 들어가요.
- `pending`은 아직 분석 안 된 영상이에요. `status`는 `NOT_ANALYZED` / `PENDING` / `PROCESSING` / `FAILED` 중 하나예요.
- 이 API는 분석을 시작하지 않아요. `pending` 영상은 사용자가 클릭할 때 `POST /api/search`로 분석을 시작해요.
- 시간은 모두 초 단위(소수 가능)이고, `score`는 0~1 범위예요.

## 5. 에러 응답 (공통)
```json
{ "error": { "code": "INVALID_YOUTUBE_ID", "message": "올바르지 않은 영상 ID입니다." } }
```

| HTTP | code | 의미 |
|---|---|---|
| 400 | INVALID_YOUTUBE_ID | 영상 ID 형식 오류 |
| 400 | EMPTY_QUERY | 검색어가 비어 있음 |
| 404 | VIDEO_NOT_FOUND | 유튜브에 없는 영상이거나 등록되지 않은 영상 |
| 422 | VIDEO_TOO_LONG | 길이 제한(현재 30분) 초과 |
| 502 | YOUTUBE_ERROR | 유튜브 API 호출 실패 |
| 503 | YOUTUBE_QUOTA | 유튜브 API 일일 한도 초과 |

## 현재 정해진 것과 확인 중인 것
- 로그인: 검색은 로그인 없이 가능, 즐겨찾기만 필수 (정해짐)
- 분석 가능한 영상 최대 길이: 현재 **30분** (임시값, 팀 논의 후 조정)
- `score` 범위: 0~1 (확인됨). 서로 다른 영상끼리 점수를 비교해도 되는지는 AI 파트에 확인 중
- 한국어 검색어: 동작은 하지만 정확도는 AI 파트에 확인 중