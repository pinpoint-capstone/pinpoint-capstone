import React, { useState } from 'react';
import {
  Bookmark,
  Clock3,
  Library,
  Play,
  Search,
} from 'lucide-react';

type LibraryTab = 'saved' | 'recent';

export const LibraryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('saved');

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
          </button>
        </div>

        {/* Saved */}
        {activeTab === 'saved' && (
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
        )}

        {/* Recent */}
        {activeTab === 'recent' && (
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
        )}
      </div>
    </main>
  );
};