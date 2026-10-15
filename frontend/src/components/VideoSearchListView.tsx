import React from 'react';
import { SearchResultItem, VideoMetadata } from '../types';
import { formatTime } from '../utils/formatters';
import { Play, LoaderCircle, Search, Sparkles } from 'lucide-react';

interface VideoSearchListViewProps {
  results: SearchResultItem[];
  videosMap: Record<string, VideoMetadata>;
  isLoading: boolean;
  searchQuery: string;
  onSelectResult: (item: SearchResultItem) => void;
}

export const VideoSearchListView: React.FC<VideoSearchListViewProps> = ({
  results,
  videosMap,
  isLoading,
  searchQuery,
  onSelectResult,
}) => {
  // 같은 영상에 속한 AI 검색 구간을 하나로 묶기
  const groupedResults = new Map<string, SearchResultItem[]>();

  for (const item of results) {
    const existing = groupedResults.get(item.video_id) || [];
    existing.push(item);
    groupedResults.set(item.video_id, existing);
  }

  // 영상마다 관련도가 가장 높은 구간 선택
  const videos = Array.from(groupedResults.entries())
    .map(([videoId, segments]) => {
      const video = videosMap[videoId];

      if (!video) return null;

      const sortedSegments = [...segments].sort(
        (a, b) => b.score - a.score
      );

      return {
        video,
        segments: sortedSegments,
        bestSegment: sortedSegments[0],
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> => item !== null
    )
    .sort(
      (a, b) => b.bestSegment.score - a.bestSegment.score
    );

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F8FAFC] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">

        {/* 검색 제목 */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-slate-900">
            영상 검색 결과
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            검색어: {searchQuery}
          </p>
        </div>

        {/* AI 분석 중: 검색 결과가 아직 없을 때 */}
        {videos.length === 0 && isLoading && (
          <div
            role="status"
            className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center"
          >
            <LoaderCircle className="mb-5 h-12 w-12 animate-spin text-blue-600" />

            <h2 className="text-lg font-bold text-slate-900">
              AI 영상 분석 중...
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              검색어와 관련된 영상 구간을 찾고 있습니다.
              <br />
              분석이 완료되는 대로 결과를 보여드릴게요.
            </p>
          </div>
        )}

        {/* 검색 결과 없음 */}
        {videos.length === 0 && !isLoading && (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <Search className="mb-4 h-10 w-10 text-slate-400" />

            <h2 className="text-lg font-bold text-slate-800">
              검색 결과가 없습니다
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              다른 검색어로 다시 검색해 보세요.
            </p>
          </div>
        )}

        {/* AI 분석이 완료된 영상 목록 */}
        {videos.length > 0 && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-600">
                분석된 영상 {videos.length}개
              </span>

              {isLoading && (
                <span className="flex items-center gap-2 text-xs font-medium text-blue-600">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  추가 영상 분석 중...
                </span>
              )}
            </div>

            <div className="space-y-4">
              {videos.map(
                ({ video, segments, bestSegment }) => (
                  <button
                    key={video.video_id}
                    type="button"
                    onClick={() => onSelectResult(bestSegment)}
                    className="group flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md sm:flex-row"
                  >
                    {/* 영상 썸네일 */}
                    <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-64">
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* AI가 찾은 시작 시간 */}
                      <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-xs font-semibold text-white">
                        {formatTime(bestSegment.start_time)}
                      </span>

                      {/* 마우스를 올리면 재생 버튼 표시 */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
                          <Play className="h-5 w-5 fill-slate-900 text-slate-900" />
                        </div>
                      </div>
                    </div>

                    {/* 영상 정보 */}
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <h2 className="line-clamp-2 text-base font-bold leading-snug text-slate-900 group-hover:text-blue-600 sm:text-lg">
                        {video.title}
                      </h2>

                      <p className="mt-2 text-sm text-slate-500">
                        {video.channelName}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          <Sparkles className="h-3.5 w-3.5" />
                          AI 검색 구간 {segments.length}개
                        </span>

                        <span className="text-xs text-slate-500">
                          최고 관련도 {bestSegment.score.toFixed(3)}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-slate-600">
                        가장 관련 있는 구간:{' '}
                        <span className="font-semibold text-blue-600">
                          {formatTime(bestSegment.start_time)}
                          {' - '}
                          {formatTime(bestSegment.end_time)}
                        </span>
                      </p>

                      <p className="mt-3 text-xs font-semibold text-blue-600">
                        클릭하여 해당 구간부터 재생 →
                      </p>
                    </div>
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
};