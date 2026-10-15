
import React from 'react';
import { SearchResultItem, VideoMetadata } from '../types';
import { PendingVideoStatus } from '../services/searchApi';
import { formatTime } from '../utils/formatters';
import {
  Play,
  LoaderCircle,
  Search,
  Sparkles,
} from 'lucide-react';

interface VideoSearchListViewProps {
  results: SearchResultItem[];
  videosMap: Record<string, VideoMetadata>;
  youtubeVideoIds: string[];
  analysisStatuses: Record<string, PendingVideoStatus>;
  isLoading: boolean;
  searchQuery: string;
  onSelectResult: (item: SearchResultItem) => void;
  onAnalyzeVideo: (youtubeVideoId: string) => void;
}

export const VideoSearchListView: React.FC<
  VideoSearchListViewProps
> = ({
  results,
  videosMap,
  youtubeVideoIds,
  analysisStatuses,
  isLoading,
  searchQuery,
  onSelectResult,
  onAnalyzeVideo,
}) => {
const videoEntries: VideoMetadata[] = Object.values(videosMap);

  const videos = youtubeVideoIds
    .map((youtubeId) => {
      const analyzedResult = results.find(
        (item) =>
          videosMap[item.video_id]?.youtube_video_id === youtubeId
      );

      const video =
        (analyzedResult
          ? videosMap[analyzedResult.video_id]
          : undefined) ??
        videoEntries.find(
          (item) => item.youtube_video_id === youtubeId
        );

      if (!video) return null;

      const segments = results
        .filter(
          (item) =>
            item.video_id === video.video_id ||
            videosMap[item.video_id]?.youtube_video_id === youtubeId
        )
        .sort((a, b) => b.score - a.score);

      return {
        youtubeId,
        video,
        segments,
        bestSegment: segments[0] as
          | SearchResultItem
          | undefined,
        status: analysisStatuses[youtubeId],
      };
    })
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null
    );

  return (
    <main className="min-h-[calc(100vh-61px)] bg-[#F8FAFC] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-slate-900">
            영상 검색 결과
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            검색어: {searchQuery}
          </p>
        </div>

        {videos.length === 0 && isLoading && (
          <div
            role="status"
            className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center"
          >
            <LoaderCircle className="mb-5 h-12 w-12 animate-spin text-blue-600" />

            <h2 className="text-lg font-bold text-slate-900">
              영상 검색 중...
            </h2>

            <p className="mt-3 text-sm text-slate-500">
              검색어와 관련된 YouTube 영상을 찾고 있습니다.
            </p>
          </div>
        )}

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

        {videos.length > 0 && (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-600">
                검색된 영상 {videos.length}개
              </span>

              {isLoading && (
                <span className="flex items-center gap-2 text-xs font-medium text-blue-600">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  AI 분석 결과 확인 중...
                </span>
              )}
            </div>

            <div className="space-y-4">
              {videos.map(
                ({
                  youtubeId,
                  video,
                  segments,
                  bestSegment,
                  status,
                }) => {
                  const isProcessing =
                    status === 'PENDING' ||
                    status === 'PROCESSING';

                  const canAnalyze =
                    !bestSegment &&
                    (status === 'NOT_ANALYZED' ||
                      status === 'FAILED' ||
                      status === undefined);

                  const canClick =
                    Boolean(bestSegment) || canAnalyze;

                  let statusLabel = '분석 전';

                  if (isProcessing) {
                    statusLabel = '분석 중...';
                  } else if (status === 'FAILED') {
                    statusLabel = '분석 실패 · 다시 시도';
                  } else if (status === 'TOO_LONG') {
                    statusLabel = '분석 불가 · 영상 길이 초과';
                  } else if (status === 'NOT_FOUND') {
                    statusLabel = '영상을 찾을 수 없음';
                  }

                  return (
                    <button
                      key={youtubeId}
                      type="button"
                      disabled={!canClick}
                      onClick={() => {
                        if (bestSegment) {
                          onSelectResult(bestSegment);
                        } else if (canAnalyze) {
                          onAnalyzeVideo(youtubeId);
                        }
                      }}
                      className={`group flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all sm:flex-row ${
                        canClick
                          ? 'cursor-pointer hover:border-blue-300 hover:shadow-md'
                          : 'cursor-default'
                      }`}
                    >
                      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-64">
                        <img
                          src={video.thumbnailUrl}
                          alt={video.title}
                          className="h-full w-full object-cover"
                        />

                        {bestSegment && (
                          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-xs font-semibold text-white">
                            {formatTime(
                              bestSegment.start_time
                            )}
                          </span>
                        )}

                        {bestSegment && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90">
                              <Play className="h-5 w-5 fill-slate-900 text-slate-900" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col justify-center">
                        <h2 className="line-clamp-2 text-base font-bold leading-snug text-slate-900 sm:text-lg">
                          {video.title}
                        </h2>

                        <p className="mt-2 text-sm text-slate-500">
                          {video.channelName}
                        </p>

                        {bestSegment ? (
                          <>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                <Sparkles className="h-3.5 w-3.5" />
                                AI 검색 구간{' '}
                                {segments.length}개
                              </span>

                              <span className="text-xs text-slate-500">
                                최고 관련도{' '}
                                {bestSegment.score.toFixed(3)}
                              </span>
                            </div>

                            <p className="mt-3 text-sm text-slate-600">
                              가장 관련 있는 구간:{' '}
                              <span className="font-semibold text-blue-600">
                                {formatTime(
                                  bestSegment.start_time
                                )}
                                {' - '}
                                {formatTime(
                                  bestSegment.end_time
                                )}
                              </span>
                            </p>

                            <p className="mt-3 text-xs font-semibold text-blue-600">
                              클릭하여 해당 구간부터 재생 →
                            </p>
                          </>
                        ) : (
                          <div className="mt-4">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                isProcessing
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isProcessing && (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              )}
                              {statusLabel}
                            </span>

                            <p className="mt-3 text-sm text-slate-500">
                              {isProcessing
                                ? 'AI가 해당 영상을 분석하고 있습니다.'
                                : canAnalyze
                                  ? '클릭하여 이 영상의 AI 분석을 시작하세요.'
                                  : '현재 이 영상에서 검색된 AI 구간이 없습니다.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
};
