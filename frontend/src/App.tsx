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
    '에어팟 프로 2 배터리를 설명하는 부분'
  );

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

  const handleSelectResult = (item: SearchResultItem) => {
    setSelectedSegment(item);
    setCurrentVideoId(item.video_id);
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

      {currentView === 'library' && <LibraryView />}
    </div>
  );
}