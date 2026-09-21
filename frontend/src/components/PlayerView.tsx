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
      {/* Left Slim Sidebar (Matches screenshot 2) */}
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

      {/* Main Container */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        {/* Two Column Layout: Player Column (Left) & Search Results Column (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left: Video Player, Title, Segment Timeline, Chapters (7 or 8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/90 shadow-2xs">
            <VideoPlayer
              video={currentVideo}
              selectedSegment={selectedSegment}
              onTimeUpdate={(time) => setCurrentVideoTime(time)}
              targetSeekTime={targetSeekTime}
              onSeekHandled={handleSeekHandled}
            />

            {/* Same Video other Chapters / Moments */}
            <ChapterSegments
              chapters={currentVideo.chapters}
              currentTime={currentVideoTime}
              onSelectTimestamp={handleSelectChapterTimestamp}
            />
          </div>

          {/* Right: Search Results List (4 or 5 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs sticky top-20">
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
