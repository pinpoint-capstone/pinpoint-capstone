# PinPoint 검색 API 명세 (초안 v0.1)

## 흐름
1. 프론트가 `GET /api/youtube/search`로 영상 목록 조회
2. 사용자가 영상 클릭 → `POST /api/search`
3. 이미 분석된 영상이면 바로 결과(200), 처음 보는 영상이면 분석 시작(202)
4. 202면 `GET .../status`를 2~3초마다 확인
5. `INDEXED`가 되면 `POST /api/search`를 다시 호출 → 결과(200)
6. 프론트가 `start_time`으로 유튜브 플레이어 seek

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

## 2. 장면 검색
`POST /api/search`

요청
```json
{
  "youtube_video_id": "Ps8FeqKyFoM",
  "query": "골 넣고 세리머니하는 장면",
  "top_k": 5
}
```
`top_k`는 선택(기본 5)이고, URL은 백엔드가 만들어서 보내지 않아도 돼요.

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
`results`는 점수 높은 순이고, 시간은 초 단위(소수 가능)예요.

응답 202 (처음 보는 영상, 분석 시작됨)
```json
{
  "status": "PROCESSING",
  "youtube_video_id": "Ps8FeqKyFoM",
  "message": "영상을 분석 중입니다."
}
```

## 3. 분석 상태 확인
`GET /api/videos/youtube/{youtube_video_id}/status`

```json
{
  "youtube_video_id": "Ps8FeqKyFoM",
  "status": "PROCESSING",
  "error_message": null
}
```
`status`는 `PENDING` / `PROCESSING` / `INDEXED` / `FAILED` 중 하나예요. `FAILED`면 `error_message`에 사유가 들어가요.

## 4. 에러 응답 (공통)
```json
{ "error": { "code": "INVALID_YOUTUBE_ID", "message": "올바르지 않은 영상 ID입니다." } }
```

| HTTP | code | 의미 |
|---|---|---|
| 400 | INVALID_YOUTUBE_ID | 영상 ID 형식 오류 |
| 400 | EMPTY_QUERY | 검색어가 비어 있음 |
| 422 | VIDEO_TOO_LONG | 길이 제한 초과 (제한 값 합의 필요) |
| 502 | DOWNLOAD_FAILED | 영상 다운로드 실패 |
| 503 | YOUTUBE_QUOTA | 유튜브 API 일일 한도 초과 |

## 합의가 필요한 것
- 검색 API에 로그인(인증)을 요구할지
- 분석 가능한 영상 최대 길이 (예: 30분)
- `score` 범위 (AI 파트 확인 필요)