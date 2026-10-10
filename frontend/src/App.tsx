
import { useState, useEffect } from 'react';
import { VideoMetadata, SearchResultItem } from './types';
import { MOCK_VIDEOS } from './data/mockData';
import {
  searchYouTubeVideos,
  searchMultipleVideos,
  convertMultiSearchResults,
} from './services/searchApi';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { PlayerView } from './components/PlayerView';
import { BrowseView } from './components/BrowseView';
import { AuthView } from './components/AuthView';
import { LibraryView } from './components/LibraryView';

type AppView = 'home' | 'player' | 'browse' | 'auth' | 'library';

interface User {
  name: string;
  email: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;

      if (path === '/browse') return 'browse';
      if (path === '/search') return 'player';
      if (path === '/login') return 'auth';
      if (path === '/library') return 'library';
    }

    return 'home';
  });

  const [searchQuery, setSearchQuery] = useState<string>('');

  // 기존 Mock 영상 + 실제 YouTube 영상 정보 관리
  const [videosMap, setVideosMap] =
    useState<Record<string, VideoMetadata>>(MOCK_VIDEOS);

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const [selectedSegment, setSelectedSegment] =
    useState<SearchResultItem | null>(null);

  const [currentVideoId, setCurrentVideoId] = useState<string>('abc123');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 로그인 사용자 정보 복원
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;

    const savedUser = localStorage.getItem('pinpoint-user');

    if (!savedUser) return null;

    try {
      return JSON.parse(savedUser);
    } catch {
      return null;
    }
  });

  // 브라우저 뒤로가기 / 앞으로가기 처리
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;

      if (path === '/browse') {
        setCurrentView('browse');
      } else if (path === '/search') {
        setCurrentView('player');
      } else if (path === '/login') {
        setCurrentView('auth');
      } else if (path === '/library') {
        setCurrentView('library');
      } else {
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 실제 YouTube + AI 다중 영상 검색
  const executeSearch = async (query: string, targetVideoId?: string) => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    setSearchQuery(trimmedQuery);
    setCurrentView('player');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/search'
    ) {
      window.history.pushState(null, '', '/search');
    }

    setIsLoading(true);
    setSearchResults([]);
    setSelectedSegment(null);

    try {
      // 1. YouTube에서 관련 영상 검색
      const youtubeResponse = await searchYouTubeVideos(trimmedQuery, 5);

      const youtubeVideoIds = youtubeResponse.items.map(
        (video) => video.youtube_video_id
      );

      // 2. YouTube 영상 정보를 기존 프론트 형식으로 변환
      const youtubeVideos: Record<string, VideoMetadata> = {};

      for (const video of youtubeResponse.items) {
        youtubeVideos[video.youtube_video_id] = {
          video_id: video.youtube_video_id,
          youtube_video_id: video.youtube_video_id,
          title: video.title,
          category: 'youtube',
          categoryLabel: 'YouTube',
          channelName: video.channel_name,
          publishDate: video.published_at || '',
          views: '',
          thumbnailUrl: video.thumbnail_url,
          videoUrl: `https://www.youtube.com/watch?v=${video.youtube_video_id}`,
          totalDuration: 0,
          chapters: [],
        };
      }

      // 3. 여러 영상의 AI 구간 검색
      const multiResponse = await searchMultipleVideos(
        trimmedQuery,
        youtubeVideoIds,
        3
      );

      // 4. 백엔드 응답을 기존 프론트 형식으로 변환
      const { results, videos } = convertMultiSearchResults(multiResponse);

      // 5. 실제 영상 정보 저장
      setVideosMap((previous) => ({
        ...previous,
        ...youtubeVideos,
        ...videos,
      }));

      // 6. AI 검색 결과 저장
      setSearchResults(results);

      if (results.length > 0) {
        const matchedItem = targetVideoId
          ? results.find(
              (result) =>
                result.video_id === targetVideoId ||
                videos[result.video_id]?.youtube_video_id === targetVideoId
            )
          : null;

        const selectedItem = matchedItem || results[0];

        setSelectedSegment(selectedItem);
        setCurrentVideoId(selectedItem.video_id);
      } else if (youtubeVideoIds.length > 0) {
        // AI 분석이 아직 완료되지 않은 경우
        setCurrentVideoId(youtubeVideoIds[0]);
      }

      console.log('YouTube 검색 결과:', youtubeResponse);
      console.log('AI 다중 검색 결과:', multiResponse);
    } catch (error) {
      console.error('실제 영상 검색 오류:', error);
      setSearchResults([]);
      setSelectedSegment(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 최근 본 구간 저장
  const saveRecentSegment = (item: SearchResultItem) => {
    try {
      const recent = JSON.parse(
        localStorage.getItem('pinpoint-recent-segments') || '[]'
      ) as SearchResultItem[];

      // 같은 구간이 이미 있으면 기존 기록 제거
      const filtered = recent.filter(
        (recentItem) => recentItem.segment_id !== item.segment_id
      );

      // 가장 최근에 본 구간을 맨 앞으로
      const updated = [item, ...filtered].slice(0, 20);

      localStorage.setItem(
        'pinpoint-recent-segments',
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error('최근 본 구간 저장 중 오류:', error);
    }
  };

  // 검색 결과 클릭
  const handleSelectResult = (item: SearchResultItem) => {
    setSelectedSegment(item);
    setCurrentVideoId(item.video_id);
    saveRecentSegment(item);
  };

  // 라이브러리에 저장된 구간 다시 열기
  const handleOpenLibrarySegment = (item: SearchResultItem) => {
    setSelectedSegment(item);
    setCurrentVideoId(item.video_id);
    saveRecentSegment(item);

    // 검색 결과 영역에서도 현재 구간이 보이도록 설정
    setSearchResults([item]);

    setCurrentView('player');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/search'
    ) {
      window.history.pushState(null, '', '/search');
    }
  };

  // 홈으로 이동
  const handleNavigateHome = () => {
    setCurrentView('home');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/'
    ) {
      window.history.pushState(null, '', '/');
    }
  };

  // 영상 탐색 화면으로 이동
  const handleNavigateBrowse = () => {
    setCurrentView('browse');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/browse'
    ) {
      window.history.pushState(null, '', '/browse');
    }
  };

  // 로그인 화면으로 이동
  const handleNavigateAuth = () => {
    setCurrentView('auth');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      window.history.pushState(null, '', '/login');
    }
  };

  // 라이브러리 화면으로 이동
  const handleNavigateLibrary = () => {
    setCurrentView('library');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/library'
    ) {
      window.history.pushState(null, '', '/library');
    }
  };

  // 로그인 성공
  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentView('home');

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  // 로그아웃
  const handleLogout = () => {
    localStorage.removeItem('pinpoint-user');
    setUser(null);
    setCurrentView('home');

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  // 현재 선택된 영상
  const activeVideo =
    videosMap[currentVideoId] ||
    videosMap['abc123'] ||
    Object.values(videosMap)[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      <Header
        currentView={currentView}
        searchQuery={searchQuery}
        onSearchQueryChange={(val) => setSearchQuery(val)}
        onSearchSubmit={() => executeSearch(searchQuery)}
        onNavigateHome={handleNavigateHome}
        onNavigateBrowse={handleNavigateBrowse}
        onNavigateAuth={handleNavigateAuth}
        onNavigateLibrary={handleNavigateLibrary}
        onLogout={handleLogout}
        user={user}
      />

      {currentView === 'home' && (
        <HomeView
          initialQuery={searchQuery}
          onSearch={(query, targetVideoId) =>
            executeSearch(query, targetVideoId)
          }
        />
      )}

      {currentView === 'browse' && (
        <BrowseView
          onSearch={(query, targetVideoId) =>
            executeSearch(query, targetVideoId)
          }
        />
      )}

      {currentView === 'player' && (
        <PlayerView
          currentVideo={activeVideo}
          selectedSegment={selectedSegment}
          searchResults={searchResults}
          videosMap={videosMap}
          isLoading={isLoading}
          searchQuery={searchQuery}
          onSelectResult={handleSelectResult}
          onNavigateHome={handleNavigateHome}
          onSelectSuggestion={(rec) => executeSearch(rec)}
        />
      )}

      {currentView === 'auth' && (
        <AuthView
          onNavigateHome={handleNavigateHome}
          onLoginSuccess={handleLoginSuccess}
        />
      )}

      {currentView === 'library' && (
        <LibraryView onOpenSegment={handleOpenLibrarySegment} />
      )}
    </div>
  );
}
