import React from 'react';
import { SearchResultItem, VideoMetadata } from '../types';
import { formatTime, formatScore } from '../utils/formatters';
import { Play, Sparkles, AlertCircle } from 'lucide-react';

interface SearchResultsListProps {
  results: SearchResultItem[];
  videosMap: Record<string, VideoMetadata>;
  selectedSegmentId: string | null;
  onSelectResult: (item: SearchResultItem) => void;
  isLoading: boolean;
  searchQuery: string;
  onSelectSuggestion?: (query: string) => void;
}

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  results,
  videosMap,
  selectedSegmentId,
  onSelectResult,
  isLoading,
  searchQuery,
  onSelectSuggestion,
}) => {
  return (
    <div className="w-full flex flex-col">
      {/* Header bar: "검색 결과" & "N개 영상" */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            검색 결과
          </h2>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 text-blue-500" />
            AI 매칭순
          </span>
        </div>
        <span className="text-xs font-semibold text-slate-500">
          {isLoading ? '검색 중...' : `${results.length}개 영상`}
        </span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-slate-200 bg-white animate-pulse flex gap-3"
            >
              <div className="w-32 aspect-video bg-slate-200 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-slate-200 rounded w-4/5" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && results.length === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200/80 shadow-2xs my-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 mb-1">
            검색 결과가 없습니다
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4 leading-relaxed">
            "{searchQuery}"에 일치하는 영상 구간을 찾지 못했습니다. 보다 구체적인 행동이나 키워드로 검색해보세요.
          </p>
          {onSelectSuggestion && (
            <div className="space-y-1.5 text-left">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                추천 검색어로 시도해보기:
              </span>
              {[
                '에어팟 프로 2 배터리를 설명하는 부분',
                '실험에서 용액을 옮기는 장면',
                '경기에서 골이 들어가는 순간'
              ].map((rec) => (
                <button
                  key={rec}
                  onClick={() => onSelectSuggestion(rec)}
                  className="w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50/80 py-1 px-2.5 rounded-md transition-colors"
                >
                  • {rec}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results List */}
      {!isLoading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((item) => {
            const video = videosMap[item.video_id];
            const isSelected = selectedSegmentId === item.segment_id;

            if (!video) return null;

            return (
              <div
                key={item.segment_id}
                id={`result-card-${item.segment_id}`}
                onClick={() => onSelectResult(item)}
                className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200/90 bg-white hover:border-blue-300 hover:bg-slate-50/60 shadow-2xs'
                }`}
              >
                <div className="flex gap-3 items-start">
                  {/* Thumbnail with duration badge */}
                  <div className="relative w-28 sm:w-32 aspect-video rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200/60">
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {/* Timestamp Badge */}
                    <div className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-2xs text-white text-[10px] font-mono font-medium px-1.5 py-0.5 rounded shadow-xs">
                      {formatTime(item.start_time)}
                    </div>
                    {/* Hover play icon overlay */}
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="w-3 h-3 text-slate-900 fill-slate-900 ml-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Info Column */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                    <div>
                      {/* Top row: time range & score */}
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono text-xs font-semibold text-blue-600">
                          {formatTime(item.start_time)} - {formatTime(item.end_time)}
                        </span>
                        <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap border border-blue-200/70" title={`관련도 점수: ${item.score}`}>
                          Score {item.score}
                        </span>
                      </div>

                      {/* Video Title */}
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors">
                        {video.title}
                      </h4>
                    </div>

                    {/* Channel & Category */}
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                      <span className="truncate">{video.channelName}</span>
                      <span className="text-slate-400 shrink-0 ml-1">
                        {video.categoryLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Active Indicator: "● 현재 재생 중" */}
                {isSelected && (
                  <div className="pt-2 border-t border-blue-100 flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span>현재 재생 중</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
