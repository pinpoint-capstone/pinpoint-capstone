import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Clock3,
  Library,
  Play,
  Search,
  Trash2,
} from 'lucide-react';

import { SearchResultItem } from '../types';
import { MOCK_VIDEOS } from '../data/mockData';
import { formatTime } from '../utils/formatters';

type LibraryTab = 'saved' | 'recent';

interface LibraryViewProps {
  onOpenSegment: (item: SearchResultItem) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onOpenSegment,
}) => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('saved');

  const [savedSegments, setSavedSegments] = useState<SearchResultItem[]>([]);
  const [recentSegments, setRecentSegments] = useState<SearchResultItem[]>([]);

  // 저장한 구간 + 최근 본 구간 불러오기
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('pinpoint-saved-segments') || '[]'
      ) as SearchResultItem[];

      const recent = JSON.parse(
        localStorage.getItem('pinpoint-recent-segments') || '[]'
      ) as SearchResultItem[];

      setSavedSegments(saved);
      setRecentSegments(recent);
    } catch (error) {
      console.error('라이브러리 데이터를 불러오는 중 오류:', error);
      setSavedSegments([]);
      setRecentSegments([]);
    }
  }, []);

  // 저장한 구간 삭제
  const handleDeleteSavedSegment = (segmentId: string) => {
    const updated = savedSegments.filter(
      (item) => item.segment_id !== segmentId
    );

    setSavedSegments(updated);

    localStorage.setItem(
      'pinpoint-saved-segments',
      JSON.stringify(updated)
    );
  };

  // 최근 본 구간 삭제
  const handleDeleteRecentSegment = (segmentId: string) => {
    const updated = recentSegments.filter(
      (item) => item.segment_id !== segmentId
    );

    setRecentSegments(updated);

    localStorage.setItem(
      'pinpoint-recent-segments',
      JSON.stringify(updated)
    );
  };

  // 구간 카드
  const renderSegmentCard = (
    segment: SearchResultItem,
    type: 'saved' | 'recent'
  ) => {
    const video = MOCK_VIDEOS[segment.video_id];

    return (
      <div
        key={segment.segment_id}
        className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
      >
        {/* 썸네일 */}
        <div className="relative aspect-video bg-slate-100 overflow-hidden">
          {video?.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <Play className="w-8 h-8" />
            </div>
          )}

          {/* 구간 시간 */}
          <div className="absolute bottom-3 left-3 bg-black/75 text-white text-xs font-mono px-2.5 py-1 rounded-lg">
            {formatTime(segment.start_time)}
            {' - '}
            {formatTime(segment.end_time)}
          </div>

          {/* 관련도 */}
          <div className="absolute top-3 right-3 bg-white/95 text-blue-600 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm">
            관련도 {Math.round(segment.score * 100)}%
          </div>
        </div>

        {/* 카드 내용 */}
        <div className="p-4">
          <h2 className="font-bold text-slate-900 line-clamp-2">
            {video?.title || segment.video_id}
          </h2>

          {video && (
            <p className="text-xs text-slate-500 mt-1">
              {video.channelName}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => onOpenSegment(segment)}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-blue-600" />
              {formatTime(segment.start_time)}부터 보기
            </button>

            <button
              type="button"
              onClick={() => {
                if (type === 'saved') {
                  handleDeleteSavedSegment(segment.segment_id);
                } else {
                  handleDeleteRecentSegment(segment.segment_id);
                }
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title={type === 'saved' ? '저장 삭제' : '기록 삭제'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="flex-1 bg-[#F8FAFC]">
      <div className="max-w-6xl mx-auto px-6 py-10">

        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Library className="w-6 h-6 text-blue-600" />

            <h1 className="text-2xl font-bold text-slate-900">
              내 라이브러리
            </h1>
          </div>

          <p className="text-sm text-slate-500">
            저장한 영상 구간과 최근 본 구간을 한곳에서 확인하세요.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'saved'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            저장한 구간

            {savedSegments.length > 0 && (
              <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-blue-100 text-blue-600 text-[11px] flex items-center justify-center">
                {savedSegments.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('recent')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'recent'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock3 className="w-4 h-4" />
            최근 본 구간

            {recentSegments.length > 0 && (
              <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-blue-100 text-blue-600 text-[11px] flex items-center justify-center">
                {recentSegments.length}
              </span>
            )}
          </button>
        </div>

        {/* 저장한 구간 */}
        {activeTab === 'saved' && (
          <>
            {savedSegments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-16 px-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Bookmark className="w-6 h-6 text-blue-600" />
                </div>

                <h2 className="text-lg font-bold text-slate-900 mb-2">
                  아직 저장한 구간이 없어요
                </h2>

                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  검색 결과에서 원하는 영상 구간을 찾은 뒤 저장하면
                  이곳에서 다시 확인할 수 있어요.
                </p>

                <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
                  <Search className="w-4 h-4" />
                  원하는 장면을 검색해보세요
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {savedSegments.map((segment) =>
                  renderSegmentCard(segment, 'saved')
                )}
              </div>
            )}
          </>
        )}

        {/* 최근 본 구간 */}
        {activeTab === 'recent' && (
          <>
            {recentSegments.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-16 px-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <Clock3 className="w-6 h-6 text-blue-600" />
                </div>

                <h2 className="text-lg font-bold text-slate-900 mb-2">
                  아직 최근 본 구간이 없어요
                </h2>

                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  검색 결과에서 영상 구간을 재생하면 최근 본 기록이
                  이곳에 표시됩니다.
                </p>

                <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600">
                  <Play className="w-4 h-4" />
                  검색 결과를 재생해보세요
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {recentSegments.map((segment) =>
                  renderSegmentCard(segment, 'recent')
                )}
              </div>
            )}
          </>
        )}

      </div>
    </main>
  );
};