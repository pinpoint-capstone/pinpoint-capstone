
import { useState, useEffect, useRef } from 'react';
import { VideoMetadata, SearchResultItem } from './types';
import {
  searchYouTubeVideos,
  searchMultipleVideos,
  convertMultiSearchResults,
  MultiSearchResponse,
  PendingVideoStatus,
} from './services/searchApi';
import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { PlayerView } from './components/PlayerView';
import { VideoSearchListView } from './components/VideoSearchListView';
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

  const [videosMap, setVideosMap] = useState<
    Record<string, VideoMetadata>
  >(() => {
    try {
      const saved = localStorage.getItem('pinpoint-video-metadata');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [youtubeVideoIds, setYoutubeVideoIds] = useState<string[]>([]);
  const [selectedSegment, setSelectedSegment] =
    useState<SearchResultItem | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string>('abc123');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [analysisStatuses, setAnalysisStatuses] = useState<
    Record<string, PendingVideoStatus>
  >({});

  const searchIdRef = useRef(0);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedSegmentRef = useRef<SearchResultItem | null>(null);

  // 현재 검색의 최신 조건을 보관
  const searchContextRef = useRef<{
    query: string;
    videoIds: string[];
  } | null>(null);

  // 중복 분석 요청 방지
  const analyzingVideoIdsRef = useRef<Set<string>>(new Set());

  // 동시에 여러 폴링 요청이 발생하지 않도록 관리
  const pollingInFlightRef = useRef(false);
  const refreshRequestedRef = useRef(false);

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

  const clearPollingTimer = () => {
    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  };

  const stopPolling = () => {
    searchIdRef.current += 1;
    clearPollingTimer();

    searchContextRef.current = null;
    analyzingVideoIdsRef.current.clear();
    pollingInFlightRef.current = false;
    refreshRequestedRef.current = false;

    setIsLoading(false);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    return () => {
      searchIdRef.current += 1;

      if (pollingTimerRef.current !== null) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

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

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 백엔드 검색 결과를 공통으로 반영
  const applySearchResponse = (
    response: MultiSearchResponse,
    currentSearchId: number
  ): boolean => {
    if (currentSearchId !== searchIdRef.current) {
      return false;
    }

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

    const nextStatuses: Record<string, PendingVideoStatus> = {};

    for (const video of response.pending ?? []) {
      nextStatuses[video.youtube_video_id] = video.status;
    }

    // 아직 요청 중인 영상의 상태를 유지
    for (const youtubeId of analyzingVideoIdsRef.current) {
      if (
        nextStatuses[youtubeId] === undefined ||
        nextStatuses[youtubeId] === 'NOT_ANALYZED'
      ) {
        nextStatuses[youtubeId] = 'PENDING';
      }
    }

    setAnalysisStatuses(nextStatuses);

    // 선택한 구간은 자동 갱신으로 다른 구간으로 바꾸지 않음
    if (selectedSegmentRef.current) {
      const previousSelection = selectedSegmentRef.current;

      const preservedItem = results.find(
        (item) =>
          item.segment_id === previousSelection.segment_id &&
          item.video_id === previousSelection.video_id
      );

      if (preservedItem) {
        selectedSegmentRef.current = preservedItem;
        setSelectedSegment(preservedItem);
      }
    }

    setIsLoading(false);

    const stillAnalyzing =
      hasPendingAnalysis(response) ||
      analyzingVideoIdsRef.current.size > 0;

    setIsAnalyzing(stillAnalyzing);

    return stillAnalyzing;
  };

  // 현재 검색의 전체 영상 결과를 갱신하는 단일 폴링 함수
  const refreshSearchResults = async (
    currentSearchId: number
  ): Promise<void> => {
    if (currentSearchId !== searchIdRef.current) return;

    const context = searchContextRef.current;
    if (!context || context.videoIds.length === 0) return;

    if (pollingInFlightRef.current) {
      refreshRequestedRef.current = true;
      return;
    }

    pollingInFlightRef.current = true;
    clearPollingTimer();

    let shouldContinuePolling = false;

    try {
      const response = await searchMultipleVideos(
        context.query,
        context.videoIds,
        3,
        false
      );

      if (currentSearchId !== searchIdRef.current) return;

      // 분석 요청이 완료되어 상태가 변경된 영상 정리
      for (const youtubeId of analyzingVideoIdsRef.current) {
        const pendingItem = (response.pending ?? []).find(
          (item) => item.youtube_video_id === youtubeId
        );

        const hasVideoResult = (response.videos ?? []).some(
          (entry) => entry.video.youtube_video_id === youtubeId
        );

        if (
          hasVideoResult ||
          pendingItem?.status === 'FAILED' ||
          pendingItem?.status === 'TOO_LONG' ||
          pendingItem?.status === 'NOT_FOUND'
        ) {
          analyzingVideoIdsRef.current.delete(youtubeId);
        }
      }

      shouldContinuePolling = applySearchResponse(
        response,
        currentSearchId
      );
    } catch (error) {
      if (currentSearchId !== searchIdRef.current) return;

      console.error('AI 검색 결과 갱신 오류:', error);
      setIsLoading(false);

      // 일시적인 네트워크 오류는 다음 폴링에서 재시도
      shouldContinuePolling = true;
    } finally {
      if (currentSearchId === searchIdRef.current) {
        pollingInFlightRef.current = false;

        if (refreshRequestedRef.current) {
          refreshRequestedRef.current = false;

          void refreshSearchResults(currentSearchId);
        } else if (shouldContinuePolling) {
          pollingTimerRef.current = setTimeout(() => {
            pollingTimerRef.current = null;
            void refreshSearchResults(currentSearchId);
          }, POLLING_INTERVAL_MS);
        } else {
          setIsAnalyzing(false);
        }
      }
    }
  };

  // YouTube 검색 + 최초 AI 분석
  const executeSearch = async (
    query: string,
    targetVideoId?: string
  ) => {
    void targetVideoId;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

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
    setYoutubeVideoIds([]);
    setAnalysisStatuses({});

    try {
      // 1. YouTube 영상 검색
      const youtubeResponse = await searchYouTubeVideos(
        trimmedQuery,
        20
      );

      if (currentSearchId !== searchIdRef.current) return;

      const videoIds = youtubeResponse.items.map(
        (video) => video.youtube_video_id
      );

      setYoutubeVideoIds(videoIds);

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

      if (videoIds.length === 0) {
        setIsLoading(false);
        return;
      }

      searchContextRef.current = {
        query: trimmedQuery,
        videoIds,
      };

      // 2. 최초 요청에서만 최대 4개 영상 자동 분석
      const response = await searchMultipleVideos(
        trimmedQuery,
        videoIds,
        3,
        true
      );

      if (currentSearchId !== searchIdRef.current) return;

      const stillAnalyzing = applySearchResponse(
        response,
        currentSearchId
      );

      if (stillAnalyzing) {
        clearPollingTimer();

        pollingTimerRef.current = setTimeout(() => {
          pollingTimerRef.current = null;
          void refreshSearchResults(currentSearchId);
        }, POLLING_INTERVAL_MS);
      }
    } catch (error) {
      if (currentSearchId !== searchIdRef.current) return;

      console.error('실제 영상 검색 오류:', error);
      setIsLoading(false);
      setIsAnalyzing(false);
    }
  };

  // 사용자가 클릭한 영상 하나만 AI 분석 요청
  const handleAnalyzeVideo = async (
    youtubeVideoId: string
  ) => {
    const context = searchContextRef.current;
    if (!context) return;

    if (
      !context.videoIds.includes(youtubeVideoId) ||
      analyzingVideoIdsRef.current.has(youtubeVideoId) ||
      analysisStatuses[youtubeVideoId] === 'PENDING' ||
      analysisStatuses[youtubeVideoId] === 'PROCESSING'
    ) {
      return;
    }

    const currentSearchId = searchIdRef.current;

    analyzingVideoIdsRef.current.add(youtubeVideoId);

    setAnalysisStatuses((previous) => ({
      ...previous,
      [youtubeVideoId]: 'PENDING',
    }));

    setIsAnalyzing(true);

    try {
      // 전체 영상이 아니라 클릭한 영상 하나만 요청
      const response = await searchMultipleVideos(
        context.query,
        [youtubeVideoId],
        3,
        true
      );

      if (currentSearchId !== searchIdRef.current) return;

      const pendingItem = (response.pending ?? []).find(
        (item) => item.youtube_video_id === youtubeVideoId
      );

      const hasVideoResult = (response.videos ?? []).some(
        (entry) =>
          entry.video.youtube_video_id === youtubeVideoId
      );

      if (
        hasVideoResult ||
        pendingItem?.status === 'FAILED' ||
        pendingItem?.status === 'TOO_LONG' ||
        pendingItem?.status === 'NOT_FOUND'
      ) {
        analyzingVideoIdsRef.current.delete(youtubeVideoId);
      }

      // 다른 영상 결과를 지우지 않고 전체 결과 갱신
      clearPollingTimer();
      void refreshSearchResults(currentSearchId);
    } catch (error) {
      if (currentSearchId !== searchIdRef.current) return;

      console.error('개별 영상 AI 분석 요청 오류:', error);

      analyzingVideoIdsRef.current.delete(youtubeVideoId);

      setAnalysisStatuses((previous) => ({
        ...previous,
        [youtubeVideoId]: 'FAILED',
      }));

      // 기존 자동 분석은 계속 확인
      clearPollingTimer();
      void refreshSearchResults(currentSearchId);
    }
  };

  // 최근 본 구간 저장
  const saveRecentSegment = (item: SearchResultItem) => {
    try {
      const recent = JSON.parse(
        localStorage.getItem('pinpoint-recent-segments') || '[]'
      ) as SearchResultItem[];

      const filtered = recent.filter(
        (recentItem) =>
          recentItem.segment_id !== item.segment_id
      );

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

  // 라이브러리에 저장된 구간 열기
  const handleOpenLibrarySegment = (
    item: SearchResultItem
  ) => {
    stopPolling();

    selectedSegmentRef.current = item;
    setSelectedSegment(item);
    setCurrentVideoId(item.video_id);
    saveRecentSegment(item);

    setSearchResults([item]);
    setCurrentView('player');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/search'
    ) {
      window.history.pushState(null, '', '/search');
    }
  };

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

  const handleLoginSuccess = (loggedInUser: User) => {
    stopPolling();
    setUser(loggedInUser);
    setCurrentView('home');

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  const handleLogout = () => {
    stopPolling();
    localStorage.removeItem('pinpoint-user');
    localStorage.removeItem('pinpoint-access-token');
    localStorage.removeItem('pinpoint-refresh-token');
    localStorage.removeItem('pinpoint-saved-segments');
    localStorage.removeItem('pinpoint-recent-segments');
    setUser(null);
    setCurrentView('home');

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  const activeVideo = videosMap[currentVideoId];

  // 재생 중인 영상의 AI 검색 구간만 전달
  const currentVideoResults = searchResults.filter(
    (item) =>
      item.video_id === currentVideoId ||
      (
        activeVideo?.youtube_video_id !== undefined &&
        videosMap[item.video_id]?.youtube_video_id ===
          activeVideo.youtube_video_id
      )
  );

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
        selectedSegment === null ? (
          <VideoSearchListView
            results={searchResults}
            videosMap={videosMap}
            youtubeVideoIds={youtubeVideoIds}
            analysisStatuses={analysisStatuses}
            isLoading={isLoading || isAnalyzing}
            searchQuery={searchQuery}
            onSelectResult={handleSelectResult}
            onAnalyzeVideo={handleAnalyzeVideo}
          />
        ) : activeVideo ? (
          <PlayerView
            currentVideo={activeVideo}
            selectedSegment={selectedSegment}
            searchResults={currentVideoResults}
            videosMap={videosMap}
            isLoading={isLoading || isAnalyzing}
            searchQuery={searchQuery}
            onSelectResult={handleSelectResult}
            onNavigateHome={handleNavigateHome}
            onSelectSuggestion={(rec) => executeSearch(rec)}
          />
        ) : (
          <div className="p-8 text-center text-slate-600">
            영상 정보를 불러올 수 없습니다.
          </div>
        )
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
