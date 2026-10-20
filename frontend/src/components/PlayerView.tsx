import React, { useState } from 'react';
import { Home, Search } from 'lucide-react';
import { VideoMetadata, SearchResultItem } from '../types';
import { VideoPlayer } from './VideoPlayer';
import { ChapterSegments } from './ChapterSegments';
import { SearchResultsList } from './SearchResultsList';

interface PlayerViewProps {
  currentVideo: VideoMetadata;
  selectedSegment: SearchResultItem | null;
  searchResults: SearchResultItem[];
  videosMap: Record<string, VideoMetadata>;
  isLoading: boolean;
  searchQuery: string;
  onSelectResult: (item: SearchResultItem) => void;
  onNavigateHome: () => void;
  onSelectSuggestion: (query: string) => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  currentVideo,
  selectedSegment,
  searchResults,
  videosMap,
  isLoading,
  searchQuery,
  onSelectResult,
  onNavigateHome,
  onSelectSuggestion,
}) => {
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(selectedSegment?.start_time || 0);
  const [targetSeekTime, setTargetSeekTime] = useState<number | null>(null);

  const handleSelectChapterTimestamp = (timestamp: number) => {
    setTargetSeekTime(timestamp);
  };

  const handleSeekHandled = () => {
    setTargetSeekTime(null);
  };

  return (
    <div className="w-full min-h-[calc(100vh-61px)] flex bg-[#F8FAFC]">
      <aside className="hidden md:flex flex-col items-center w-16 lg:w-48 bg-white border-r border-slate-200/80 p-3 pt-6 shrink-0">
        <nav className="w-full space-y-1.5">
          <button
            id="sidebar-home-btn"
            onClick={onNavigateHome}
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors text-xs font-semibold cursor-pointer"
            title="홈으로 가기"
          >
            <Home className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="hidden lg:inline">홈</span>
          </button>
          <button
            id="sidebar-search-btn"
            className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs cursor-default"
          >
            <Search className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="hidden lg:inline">검색</span>
          </button>
        </nav>
      </aside>

      <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-5 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
          <div className="min-w-0 lg:col-span-9 bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs">
            <VideoPlayer
              video={currentVideo}
              selectedSegment={selectedSegment}
              onTimeUpdate={(time) => setCurrentVideoTime(time)}
              targetSeekTime={targetSeekTime}
              onSeekHandled={handleSeekHandled}
            />
            <ChapterSegments
              chapters={currentVideo.chapters}
              currentTime={currentVideoTime}
              onSelectTimestamp={handleSelectChapterTimestamp}
            />
          </div>

          <div className="min-w-0 lg:col-span-3 bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-2xs lg:sticky lg:top-20">
            <SearchResultsList
              results={searchResults}
              videosMap={videosMap}
              selectedSegmentId={selectedSegment?.segment_id || null}
              onSelectResult={onSelectResult}
              isLoading={isLoading}
              searchQuery={searchQuery}
              onSelectSuggestion={onSelectSuggestion}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
