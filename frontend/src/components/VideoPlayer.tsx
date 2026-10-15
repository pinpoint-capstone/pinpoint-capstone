
import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Share2,
  Bookmark,
  Target,
  RotateCcw,
} from 'lucide-react';
import { VideoMetadata, SearchResultItem } from '../types';
import { formatTime } from '../utils/formatters';

interface VideoPlayerProps {
  video: VideoMetadata;
  selectedSegment: SearchResultItem | null;
  onTimeUpdate?: (currentTime: number) => void;
  targetSeekTime: number | null;
  onSeekHandled: () => void;
}

interface YouTubePlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

interface YouTubePlayerEvent {
  data: number;
}

interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: YouTubePlayerEvent) => void;
        onError?: (event: YouTubePlayerEvent) => void;
      };
    }
  ) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeAPI> | null = null;

function loadYouTubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();

      if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube API를 불러오지 못했습니다.'));
      }
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;

      script.onerror = () => {
        youtubeApiPromise = null;
        reject(new Error('YouTube API 스크립트 로딩 실패'));
      };

      document.head.appendChild(script);
    }
  });

  return youtubeApiPromise;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  selectedSegment,
  onTimeUpdate,
  targetSeekTime,
  onSeekHandled,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeContainerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayerInstance | null>(null);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  const selectedSegmentRef = useRef(selectedSegment);
  const onSeekHandledRef = useRef(onSeekHandled);
  const pendingSeekRef = useRef<number | null>(null);

 const isYouTube  = Boolean(video.youtube_video_id);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.totalDuration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [playerError, setPlayerError] = useState('');

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    selectedSegmentRef.current = selectedSegment;
  }, [selectedSegment]);

  useEffect(() => {
    onSeekHandledRef.current = onSeekHandled;
  }, [onSeekHandled]);

  const seekToTime = (seconds: number, play = true) => {
    const safeTime = Math.max(0, seconds);

    if (isYouTube) {
      const player = youtubePlayerRef.current;

      if (!player) {
        pendingSeekRef.current = safeTime;
        return;
      }

      player.seekTo(safeTime, true);

      if (play) {
        player.playVideo();
      }
    } else if (videoRef.current) {
      videoRef.current.currentTime = safeTime;

      if (play) {
        videoRef.current.play().catch(console.error);
      }
    }

    setCurrentTime(safeTime);
    onTimeUpdateRef.current?.(safeTime);
  };

  // YouTube 플레이어 생성
  useEffect(() => {
    if (!isYouTube || !video.youtube_video_id) {
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let createdPlayer: YouTubePlayerInstance | null = null;

    const container = youtubeContainerRef.current;

    if (!container) return;

    setPlayerError('');
    setIsPlaying(false);
    setDuration(0);

    const initialTime = selectedSegmentRef.current?.start_time || 0;
    pendingSeekRef.current = initialTime;
    setCurrentTime(initialTime);

    loadYouTubeAPI()
      .then((YT) => {
        if (cancelled || !container.isConnected) return;

        
const playerMount = document.createElement('div');
container.appendChild(playerMount);

createdPlayer = new YT.Player(playerMount, {
          videoId: video.youtube_video_id!,
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin ? 0 : 0,
          },
          events: {
            onReady: () => {
              if (cancelled || !createdPlayer) return;

              youtubePlayerRef.current = createdPlayer;

              const startTime = pendingSeekRef.current ?? 0;
              pendingSeekRef.current = null;

              createdPlayer.seekTo(startTime, true);

              setCurrentTime(startTime);
              setDuration(createdPlayer.getDuration() || 0);

              if (startTime > 0) {
                createdPlayer.playVideo();
              }

              intervalId = setInterval(() => {
                if (!createdPlayer || cancelled) return;

                try {
                  const time = createdPlayer.getCurrentTime();
                  const total = createdPlayer.getDuration();

                  if (Number.isFinite(time)) {
                    setCurrentTime(time);
                    onTimeUpdateRef.current?.(time);
                  }

                  if (Number.isFinite(total) && total > 0) {
                    setDuration(total);
                  }
                } catch {
                  // 플레이어가 종료되는 중이면 무시
                }
              }, 500);
            },
            onStateChange: (event) => {
              if (cancelled) return;

              // YouTube: 1 = 재생, 2 = 일시정지
              setIsPlaying(event.data === 1);
            },
            onError: (event) => {
              if (cancelled) return;

              console.error('YouTube 재생 오류:', event.data);
              setPlayerError(
                '이 YouTube 영상은 재생할 수 없습니다. 영상의 임베드 허용 여부를 확인해주세요.'
              );
            },
          },
        });
      })
      .catch((error) => {
        if (cancelled) return;

        console.error('YouTube 플레이어 오류:', error);
        setPlayerError('YouTube 플레이어를 불러오지 못했습니다.');
      });

    return () => {
      cancelled = true;

      if (intervalId) {
        clearInterval(intervalId);
      }

      youtubePlayerRef.current = null;

      if (createdPlayer) {
        try {
          createdPlayer.destroy();
        } catch {
          // 이미 종료된 플레이어
        }
      }
    };
  }, [isYouTube, video.youtube_video_id]);

  // 검색 결과에서 다른 구간 선택 시 해당 시점으로 이동
  useEffect(() => {
    if (!selectedSegment) return;
    if (selectedSegment.video_id !== video.video_id) return;

    seekToTime(selectedSegment.start_time);
  }, [
    selectedSegment?.segment_id,
    selectedSegment?.start_time,
    video.video_id,
  ]);

  // ChapterSegments에서 요청한 시간 이동
  useEffect(() => {
    if (targetSeekTime === null) return;

    seekToTime(targetSeekTime);
    onSeekHandledRef.current();
  }, [targetSeekTime]);

  // 저장된 구간 여부 확인
  useEffect(() => {
    if (!selectedSegment) {
      setIsSaved(false);
      return;
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem('pinpoint-saved-segments') || '[]'
      ) as SearchResultItem[];

      setIsSaved(
        saved.some(
          (item) => item.segment_id === selectedSegment.segment_id
        )
      );
    } catch {
      setIsSaved(false);
    }
  }, [selectedSegment]);

  // 기존 즐겨찾기 저장 기능 유지
  
const handleSaveSegment = async () => {
  if (!selectedSegment || isSaving) return;

  const accessToken = localStorage.getItem('pinpoint-access-token');

  if (!accessToken) {
    alert('로그인 후 이용해주세요.');
    return;
  }

  setIsSaving(true);

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const saved = JSON.parse(
      localStorage.getItem('pinpoint-saved-segments') || '[]'
    ) as SearchResultItem[];

    // 서버에 실제 저장되어 있는 즐겨찾기 조회
    const listResponse = await fetch(
      `${apiBaseUrl}/api/users/me/favorites`,
      { headers }
    );

    if (!listResponse.ok) {
      throw new Error(`즐겨찾기 조회 실패: ${listResponse.status}`);
    }

    const listData = await listResponse.json();

    // 응답이 배열이거나 favorites 배열을 포함하는 형태 지원
    const favorites = Array.isArray(listData)
      ? listData
      : Array.isArray(listData.favorites)
        ? listData.favorites
        : null;

    if (!favorites) {
      throw new Error('즐겨찾기 목록 응답 형식을 확인해야 합니다.');
    }

    const existingFavorite = favorites.find(
      (item: {
        favorite_id?: string;
        video_id: string;
        start_time: number;
        end_time: number;
      }) =>
        item.video_id === selectedSegment.video_id &&
        Number(item.start_time) === Number(selectedSegment.start_time) &&
        Number(item.end_time) === Number(selectedSegment.end_time)
    );

    if (isSaved) {
      // 저장 취소: 서버 DB에서도 실제 삭제
      if (existingFavorite) {
        if (!existingFavorite.favorite_id) {
          throw new Error('삭제할 favorite_id가 없습니다.');
        }

        const deleteResponse = await fetch(
          `${apiBaseUrl}/api/users/me/favorites/${existingFavorite.favorite_id}`,
          {
            method: 'DELETE',
            headers,
          }
        );

        if (!deleteResponse.ok) {
          throw new Error(`즐겨찾기 삭제 실패: ${deleteResponse.status}`);
        }
      }

      const updated = saved.filter(
        (item) => item.segment_id !== selectedSegment.segment_id
      );

      localStorage.setItem(
        'pinpoint-saved-segments',
        JSON.stringify(updated)
      );

      setIsSaved(false);
      return;
    }

    // 이미 DB에 저장된 구간이면 중복 POST 요청을 보내지 않음
    if (!existingFavorite) {
      const response = await fetch(
        `${apiBaseUrl}/api/users/me/favorites`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            video_id: selectedSegment.video_id,
            start_time: selectedSegment.start_time,
            end_time: selectedSegment.end_time,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`즐겨찾기 저장 실패: ${response.status}`);
      }
    }

    const updated = [
      selectedSegment,
      ...saved.filter(
        (item) => item.segment_id !== selectedSegment.segment_id
      ),
    ];

    localStorage.setItem(
      'pinpoint-saved-segments',
      JSON.stringify(updated)
    );

    setIsSaved(true);
  } catch (error) {
    console.error('구간 저장 처리 오류:', error);
    alert('구간 저장 처리 중 오류가 발생했습니다.');
  } finally {
    setIsSaving(false);
  }
};

  const togglePlay = () => {
    if (isYouTube) {
      const player = youtubePlayerRef.current;
      if (!player) return;

      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
      return;
    }

    const player = videoRef.current;
    if (!player) return;

    if (player.paused) {
      player.play().catch(console.error);
    } else {
      player.pause();
    }
  };

  const toggleMute = () => {
    if (isYouTube) {
      const player = youtubePlayerRef.current;
      if (!player) return;

      if (isMuted) {
        player.unMute();
      } else {
        player.mute();
      }
    } else if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }

    setIsMuted(!isMuted);
  };

  const toggleFullScreen = () => {
    const element = isYouTube
      ? youtubeContainerRef.current?.parentElement
      : videoRef.current;

    if (!element) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      element.requestFullscreen().catch(console.error);
    }
  };

  const handleTimelineClick = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (duration <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width)
    );

    seekToTime(ratio * duration);
  };

  const handleJumpToSegment = () => {
    if (!selectedSegment) return;
    seekToTime(selectedSegment.start_time);
  };

  const handleShare = async () => {
    const url = isYouTube && video.youtube_video_id
      ? `https://www.youtube.com/watch?v=${video.youtube_video_id}&t=${Math.floor(
          selectedSegment?.start_time ?? currentTime
        )}s`
      : window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2500);
    } catch {
      alert('링크 복사에 실패했습니다.');
    }
  };

  const totalVideoDuration = duration > 0 ? duration : 0;

  const currentProgressPercent = totalVideoDuration > 0
    ? Math.min(100, (currentTime / totalVideoDuration) * 100)
    : 0;

  const segmentStartPercent =
    selectedSegment && totalVideoDuration > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (selectedSegment.start_time / totalVideoDuration) * 100
          )
        )
      : 0;

  const segmentEndPercent =
    selectedSegment && totalVideoDuration > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (selectedSegment.end_time / totalVideoDuration) * 100
          )
        )
      : 0;

  const segmentWidthPercent = Math.max(
    1,
    segmentEndPercent - segmentStartPercent
  );

  return (
    <div className="w-full flex flex-col">
      {/* 영상 플레이어 */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-sm border border-slate-200/60">
        {isYouTube ? (
          <div className="w-full h-full">
            <div
              key={video.youtube_video_id}
              ref={youtubeContainerRef}
              className="w-full h-full"
            />
          </div>
        ) : (
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.thumbnailUrl}
            className="w-full h-full object-contain"
            controls
            playsInline
            onTimeUpdate={(event) => {
              const time = event.currentTarget.currentTime;
              setCurrentTime(time);
              onTimeUpdateRef.current?.(time);
            }}
            onLoadedMetadata={(event) => {
              const player = event.currentTarget;
              setDuration(player.duration || 0);

              if (selectedSegmentRef.current) {
                player.currentTime =
                  selectedSegmentRef.current.start_time;
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}

        {playerError && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-white text-center p-6 gap-3">
            <p className="text-sm">{playerError}</p>
            {video.youtube_video_id && (
              <a
                href={`https://www.youtube.com/watch?v=${video.youtube_video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-300 underline text-sm"
              >
                YouTube에서 열기
              </a>
            )}
          </div>
        )}
      </div>

      {/* 재생 제어 버튼 */}
      <div className="flex items-center justify-between gap-3 mt-3 px-2 py-2 rounded-xl bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            title={isPlaying ? '일시정지' : '재생'}
            className="hover:text-blue-300"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={handleJumpToSegment}
            title="검색 구간으로 이동"
            disabled={!selectedSegment}
            className="hover:text-blue-300 disabled:opacity-40"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={toggleMute}
            title="음소거"
            className="hover:text-blue-300"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>

          <span className="text-xs font-mono">
            {formatTime(currentTime)} /{' '}
            {totalVideoDuration > 0
              ? formatTime(totalVideoDuration)
              : '--:--'}
          </span>
        </div>

        <button
          onClick={toggleFullScreen}
          title="전체 화면"
          className="hover:text-blue-300"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* 영상 제목 및 정보 */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {video.title}
          </h1>

          <p className="text-xs text-slate-500 mt-1">
            <span className="font-semibold text-slate-700">
              {video.channelName}
            </span>

            {video.publishDate && (
              <span> · {video.publishDate}</span>
            )}

            {video.views && (
              <span> · 조회수 {video.views}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleShare}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium"
          >
            <Share2 className="w-3.5 h-3.5" />
            공유
          </button>

<button
  onClick={handleSaveSegment}
  disabled={!selectedSegment || isSaving}
  className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 ${
    isSaved
      ? 'border-blue-600 bg-blue-50 text-blue-600'
      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
  }`}
>
  <Bookmark
    className={`w-3.5 h-3.5 ${
      isSaved ? 'fill-blue-600' : ''
    }`}
  />
  {isSaving ? '저장 중...' : isSaved ? '저장됨' : '저장'}
</button>

          {showShareToast && (
            <div className="absolute right-0 -top-8 bg-slate-900 text-white text-xs px-2.5 py-1 rounded shadow-md whitespace-nowrap">
              링크가 복사되었습니다!
            </div>
          )}
        </div>
      </div>

      {/* AI 검색 구간 타임라인 */}
      <div className="mt-4 p-4 rounded-xl bg-slate-50/70 border border-slate-200/90">
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <Target className="w-3 h-3" />
            </div>

            <span className="font-semibold text-slate-800">
              검색된 구간:
            </span>

            {selectedSegment ? (
              <button
                onClick={handleJumpToSegment}
                className="font-mono font-bold text-blue-600 hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60"
              >
                {formatTime(selectedSegment.start_time)} -{' '}
                {formatTime(selectedSegment.end_time)}
              </button>
            ) : (
              <span className="text-slate-500">
                검색 구간 없음
              </span>
            )}
          </div>

          <span className="font-mono text-slate-500">
            전체{' '}
            {totalVideoDuration > 0
              ? formatTime(totalVideoDuration)
              : '--:--'}
          </span>
        </div>

        <div
          className="relative w-full h-3 bg-slate-200 rounded-full cursor-pointer"
          onClick={handleTimelineClick}
          title="클릭하여 시간 이동"
        >
          <div
            className="absolute left-0 top-0 bottom-0 bg-slate-300 rounded-full"
            style={{ width: `${currentProgressPercent}%` }}
          />

          {selectedSegment && totalVideoDuration > 0 && (
            <div
              className="absolute top-0 bottom-0 bg-blue-600 rounded-full"
              style={{
                left: `${segmentStartPercent}%`,
                width: `${segmentWidthPercent}%`,
              }}
            />
          )}

          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full shadow-md"
            style={{ left: `${currentProgressPercent}%` }}
          />
        </div>

        <p className="text-[11px] text-slate-500 mt-2.5">
          AI가 찾은 구간은 타임라인 위에 파란색으로 표시됩니다.
          구간 시간을 클릭하면 해당 장면으로 이동합니다.
        </p>
      </div>
    </div>
  );
};
