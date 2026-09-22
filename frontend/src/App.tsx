import { useState, useEffect } from 'react';
import { VideoMetadata, SearchResultItem } from './types';
import { MOCK_VIDEOS } from './data/mockData';
import { searchVideoSegments } from './services/searchApi';
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

  const [searchQuery, setSearchQuery] = useState<string>(
    '');

  const [videosMap] = useState<Record<string, VideoMetadata>>(MOCK_VIDEOS);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [selectedSegment, setSelectedSegment] =
    useState<SearchResultItem | null>(null);

  const [currentVideoId, setCurrentVideoId] = useState<string>('abc123');
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  const executeSearch = async (query: string, targetVideoId?: string) => {
    setSearchQuery(query);
    setCurrentView('player');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/search'
    ) {
      window.history.pushState(null, '', '/search');
    }

    setIsLoading(true);

    try {
      const response = await searchVideoSegments(query);
      const results = response.results;

      setSearchResults(results);

      if (results.length > 0) {
        let matchedItem = targetVideoId
          ? results.find((r) => r.video_id === targetVideoId)
          : null;

        if (!matchedItem) {
          matchedItem = results[0];
        }

        setSelectedSegment(matchedItem);
        setCurrentVideoId(matchedItem.video_id);
      } else {
        setSelectedSegment(null);

        if (targetVideoId && videosMap[targetVideoId]) {
          setCurrentVideoId(targetVideoId);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
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

  const handleNavigateHome = () => {
    setCurrentView('home');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/'
    ) {
      window.history.pushState(null, '', '/');
    }
  };

  const handleNavigateBrowse = () => {
    setCurrentView('browse');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/browse'
    ) {
      window.history.pushState(null, '', '/browse');
    }
  };

  const handleNavigateAuth = () => {
    setCurrentView('auth');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      window.history.pushState(null, '', '/login');
    }
  };

  const handleNavigateLibrary = () => {
    setCurrentView('library');

    if (
      typeof window !== 'undefined' &&
      window.location.pathname !== '/library'
    ) {
      window.history.pushState(null, '', '/library');
    }
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentView('home');

    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/');
    }
  };

  const handleLogout = () => {
  localStorage.removeItem('pinpoint-user');
  setUser(null);
  setCurrentView('home');

  if (typeof window !== 'undefined') {
    window.history.pushState(null, '', '/');
  }
};

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