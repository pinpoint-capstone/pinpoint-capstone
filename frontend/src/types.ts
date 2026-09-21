export interface SearchResultItem {
  video_id: string;
  segment_id: string;
  start_time: number; // seconds (float)
  end_time: number;   // seconds (float)
  score: number;      // 0.0 - 1.0 (relevance score)
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

export interface Chapter {
  segment_id?: string;
  timestamp: number; // in seconds
  title: string;
}

export interface VideoMetadata {
  video_id: string;
  title: string;
  category: string;
  categoryLabel: string;
  channelName: string;
  publishDate: string;
  views: string;
  thumbnailUrl: string;
  videoUrl: string;
  totalDuration: number; // in seconds
  chapters: Chapter[];
}

export interface SearchQueryExample {
  text: string;
  targetVideoId: string;
}
