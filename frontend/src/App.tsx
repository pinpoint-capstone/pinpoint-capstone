
import { useState, useEffect, useRef } from 'react';
import { VideoMetadata, SearchResultItem } from './types';
import { MOCK_VIDEOS } from './data/mockData';
import {
  searchYouTubeVideos,
  searchMultipleVideos,
  convertMultiSearchResults,
  MultiSearchResponse,
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

const POLLING_INTERVAL_MS = 3000;

function hasPendingAnalysis(response: MultiSearchResponse): boolean {
  return (response.pending ?? []).some(
    (item) =>
      item.status === 'NOT_ANALYZED' ||
      item.status === 'PENDING' ||
      item.status === 'PROCESSING'
  );
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
  useState<Record<string, VideoMetadata>>(() => {
    try {
      const saved = localStorage.getItem('pinpoint-video-metadata');

      return saved
        ? { ...MOCK_VIDEOS, ...JSON.parse(saved) }
        : MOCK_VIDEOS;
    } catch {
      return MOCK_VIDEOS;
    }
  });

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const [selectedSegment, setSelectedSegment] =
    useState<SearchResultItem | null>(null);

  const [currentVideoId, setCurrentVideoId] = useState<string>('abc123');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 초기 검색과 백그라운드 분석을 구분
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // 새로운 검색 또는 화면 이동 시 이전 검색을 무효화
  const searchIdRef = useRef(0);

  // 자동 재검색 타이머 관리
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 사용자가 직접 선택한 검색 결과를 자동 갱신에서 보호
  const selectedSegmentRef = useRef<SearchResultItem | null>(null);

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

  const stopPolling = () => {
    searchIdRef.current += 1;

    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    setIsLoading(false);
    setIsAnalyzing(false);
  };

  // 컴포넌트 종료 시 타이머 정리
  useEffect(() => {
    return () => {
      searchIdRef.current += 1;

      if (pollingTimerRef.current !== null) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  // 브라우저 뒤로가기 / 앞으로가기 처리
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;

      if (path !== '/search') {
        stopPolling();
      }

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

    // 이전 검색과 자동 재검색 중단
    stopPolling();
    const currentSearchId = searchIdRef.current;

    selectedSegmentRef.current = null;

    setSearchQuery(trimmedQuery);
    setCurrentView('player');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/search'
    ) {
      window.history.pushState(null, '', '/search');
    }

    setIsLoading(true);
    setIsAnalyzing(false);
    setSearchResults([]);
    setSelectedSegment(null);

    try {
      // 1. YouTube에서 관련 영상 검색
      const youtubeResponse = await searchYouTubeVideos(trimmedQuery, 5);

      if (currentSearchId !== searchIdRef.current) return;

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

  setVideosMap((previous) => {
  const updated = {
    ...previous,
    ...youtubeVideos,
  };

  localStorage.setItem(
    'pinpoint-video-metadata',
    JSON.stringify(updated)
  );

  return updated;
});

      if (youtubeVideoIds.length === 0) {
        setIsLoading(false);
        return;
      }

      // 분석 결과가 없을 때 보여줄 첫 번째 YouTube 영상
      setCurrentVideoId(youtubeVideoIds[0]);

      // 3. 백엔드 응답을 화면에 반영하는 공통 함수
      const applySearchResponse = (response: MultiSearchResponse) => {
        if (currentSearchId !== searchIdRef.current) return;

        const { results, videos } = convertMultiSearchResults(response);

       setVideosMap((previous) => {
  const updated = {
    ...previous,
    ...videos,
  };

  localStorage.setItem(
    'pinpoint-video-metadata',
    JSON.stringify(updated)
  );

  return updated;
});
        setSearchResults(results);

        if (results.length > 0) {
          const previousSelection = selectedSegmentRef.current;

          // 사용자가 선택한 구간이 여전히 존재하면 선택 유지
          const preservedItem = previousSelection
            ? results.find(
                (item) =>
                  item.segment_id === previousSelection.segment_id &&
                  item.video_id === previousSelection.video_id
              )
            : null;

          const matchedItem = targetVideoId
            ? results.find(
                (item) =>
                  item.video_id === targetVideoId ||
                  videos[item.video_id]?.youtube_video_id === targetVideoId
              )
            : null;

          const selectedItem =
            preservedItem ||
            previousSelection ||
            matchedItem ||
            results[0];

          selectedSegmentRef.current = selectedItem;
setSelectedSegment(selectedItem);
setCurrentVideoId(selectedItem.video_id);

// 검색 후 자동으로 선택된 구간도 최근 본 기록에 저장
saveRecentSegment(selectedItem);
        }

        // 초기 검색 로딩은 첫 응답이 오면 종료
        setIsLoading(false);

        // 아직 분석 중인 영상이 있는지 확인
        const stillAnalyzing = hasPendingAnalysis(response);
        setIsAnalyzing(stillAnalyzing);

        console.log('AI 다중 검색 결과:', response);

        if (stillAnalyzing) {
          // 응답을 받은 후 3초 기다렸다가 다시 검색
          pollingTimerRef.current = setTimeout(() => {
            pollingTimerRef.current = null;

            if (currentSearchId !== searchIdRef.current) return;

            void pollSearchResults();
          }, POLLING_INTERVAL_MS);
        }
      };

      // 4. 동일한 검색 조건으로 3초마다 재조회
      const pollSearchResults = async () => {
        if (currentSearchId !== searchIdRef.current) return;

        try {
          const response = await searchMultipleVideos(
            trimmedQuery,
            youtubeVideoIds,
            3,
            true
          );

          if (currentSearchId !== searchIdRef.current) return;

          applySearchResponse(response);
        } catch (error) {
          if (currentSearchId !== searchIdRef.current) return;

          console.error('AI 다중 검색 오류:', error);
          setIsLoading(false);
          setIsAnalyzing(false);
        }
      };

      // 5. 최초 AI 검색 실행
      await pollSearchResults();
    } catch (error) {
      if (currentSearchId !== searchIdRef.current) return;

      console.error('실제 영상 검색 오류:', error);
      setSearchResults([]);
      setSelectedSegment(null);
      selectedSegmentRef.current = null;
      setIsLoading(false);
      setIsAnalyzing(false);
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
    selectedSegmentRef.current = item;
    setSelectedSegment(item);
    setCurrentVideoId(item.video_id);
    saveRecentSegment(item);
  };

  // 라이브러리에 저장된 구간 다시 열기
  const handleOpenLibrarySegment = (item: SearchResultItem) => {
    stopPolling();

    selectedSegmentRef.current = item;
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
    stopPolling();
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
    stopPolling();
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
    stopPolling();
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
    stopPolling();
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
    stopPolling();
    setUser(loggedInUser);
    setCurrentView('home');

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  // 로그아웃
  const handleLogout = () => {
    stopPolling();
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
          isLoading={isLoading || isAnalyzing}
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
        <LibraryView
          onOpenSegment={handleOpenLibrarySegment}
          videosMap={videosMap}
        />
      )}
    </div>
  );
}
