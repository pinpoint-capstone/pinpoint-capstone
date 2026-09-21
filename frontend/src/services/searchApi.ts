import { SearchResponse, SearchResultItem } from '../types';
import { DEFAULT_SEARCH_RESPONSES, MOCK_VIDEOS } from '../data/mockData';

/**
 * Search API service.
 * Structured to be easily swapped with a real Backend endpoint:
 * e.g., const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
 */
export async function searchVideoSegments(query: string): Promise<SearchResponse> {
  const trimmed = query.trim();

  // Artificial brief network latency (300ms) for realistic UX and loading states
  await new Promise((resolve) => setTimeout(resolve, 350));

  if (!trimmed) {
    return {
      query: '',
      results: []
    };
  }

  // 1. Check exact or partial match in pre-defined responses
  if (DEFAULT_SEARCH_RESPONSES[trimmed]) {
    const resp = DEFAULT_SEARCH_RESPONSES[trimmed];
    return {
      query: trimmed,
      // Always sort by score descending as requested
      results: [...resp.results].sort((a, b) => b.score - a.score)
    };
  }

  // Check loose keyword match
  for (const [knownQuery, resp] of Object.entries(DEFAULT_SEARCH_RESPONSES)) {
    if (trimmed.includes('배터리') || trimmed.includes('에어팟') || trimmed.includes('이어폰')) {
      if (knownQuery.includes('배터리')) {
        return {
          query: trimmed,
          results: [...resp.results].sort((a, b) => b.score - a.score)
        };
      }
    }
    if (trimmed.includes('실험') || trimmed.includes('피펫') || trimmed.includes('용액')) {
      if (knownQuery.includes('용액')) {
        return {
          query: trimmed,
          results: [...resp.results].sort((a, b) => b.score - a.score)
        };
      }
    }
    if (trimmed.includes('골') || trimmed.includes('축구') || trimmed.includes('경기') || trimmed.includes('세레머니')) {
      if (knownQuery.includes('골')) {
        return {
          query: trimmed,
          results: [...resp.results].sort((a, b) => b.score - a.score)
        };
      }
    }
    if (trimmed.includes('문') || trimmed.includes('인테리어') || trimmed.includes('투어') || trimmed.includes('방')) {
      if (knownQuery.includes('문')) {
        return {
          query: trimmed,
          results: [...resp.results].sort((a, b) => b.score - a.score)
        };
      }
    }
  }

  // If query is something completely unrelated, e.g. "없는 검색어 예시"
  if (trimmed.includes('없는') || trimmed.includes('null') || trimmed.includes('empty')) {
    return {
      query: trimmed,
      results: []
    };
  }

  // General fallback: generate dynamic relevant results from available videos
  const dynamicResults: SearchResultItem[] = [
    {
      video_id: 'abc123',
      segment_id: 'abc123_seg_021',
      start_time: 203.4,
      end_time: 241.7,
      score: 0.93
    },
    {
      video_id: 'xyz789',
      segment_id: 'xyz789_seg_008',
      start_time: 78.2,
      end_time: 109.4,
      score: 0.88
    },
    {
      video_id: 'vlog456',
      segment_id: 'vlog456_seg_014',
      start_time: 132.0,
      end_time: 170.0,
      score: 0.84
    },
    {
      video_id: 'sport101',
      segment_id: 'sport101_seg_033',
      start_time: 165.0,
      end_time: 210.0,
      score: 0.79
    }
  ];

  return {
    query: trimmed,
    results: dynamicResults.sort((a, b) => b.score - a.score)
  };
}
