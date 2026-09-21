import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize2, Share2, Bookmark, Target, RotateCcw } from 'lucide-react';
import { VideoMetadata, SearchResultItem } from '../types';
import { formatTime } from '../utils/formatters';

interface VideoPlayerProps {
  video: VideoMetadata;
  selectedSegment: SearchResultItem | null;
  onTimeUpdate?: (currentTime: number) => void;
  targetSeekTime: number | null;
  onSeekHandled: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  selectedSegment,
  onTimeUpdate,
  targetSeekTime,
  onSeekHandled,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(selectedSegment?.start_time || 0);
  const [duration, setDuration] = useState<number>(video.totalDuration || 600);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [showShareToast, setShowShareToast] = useState<boolean>(false);

  // Handle external seek requests (e.g. clicking a search result or chapter)
  useEffect(() => {
    if (targetSeekTime !== null && videoRef.current) {
      videoRef.current.currentTime = targetSeekTime;
      setCurrentTime(targetSeekTime);
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Autoplay may need user gesture
      });
      onSeekHandled();
    }
  }, [targetSeekTime, onSeekHandled]);

  // Handle video source change
  useEffect(() => {
    if (videoRef.current) {
      if (selectedSegment) {
        videoRef.current.currentTime = selectedSegment.start_time;
        setCurrentTime(selectedSegment.start_time);
      } else {
        videoRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
    }
  }, [video.video_id]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(console.error);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    onTimeUpdate?.(time);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
    if (selectedSegment) {
      videoRef.current.currentTime = selectedSegment.start_time;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * duration;
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleJumpToSegment = () => {
    if (selectedSegment && videoRef.current) {
      videoRef.current.currentTime = selectedSegment.start_time;
      setCurrentTime(selectedSegment.start_time);
      if (!isPlaying) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullScreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      videoRef.current.requestFullscreen().catch(console.error);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
    }
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2500);
  };

  // Timeline percentages calculation
  const totalVideoDuration = duration > 0 ? duration : (video.totalDuration || 600);
  const currentProgressPercent = Math.min(100, (currentTime / totalVideoDuration) * 100);

  const segmentStartPercent = selectedSegment
    ? Math.max(0, Math.min(100, (selectedSegment.start_time / totalVideoDuration) * 100))
    : 0;
  const segmentEndPercent = selectedSegment
    ? Math.max(0, Math.min(100, (selectedSegment.end_time / totalVideoDuration) * 100))
    : 0;
  const segmentWidthPercent = Math.max(1, segmentEndPercent - segmentStartPercent);

  return (
    <div className="w-full flex flex-col">
      {/* 1. HTML5 Video Player Box */}
      <div
        className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-sm group border border-slate-200/60"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.thumbnailUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="w-full h-full object-cover cursor-pointer"
          onClick={togglePlay}
          playsInline
        />

        {/* Top Badges Overlay (Matches screenshot: "4K UHD · 08:42") */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="bg-black/70 backdrop-blur-xs text-white/90 text-[11px] font-medium px-2.5 py-1 rounded-md border border-white/10 flex items-center gap-1.5 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>4K UHD</span>
            <span className="text-white/40">·</span>
            <span className="font-mono">{formatTime(currentTime)}</span>
          </div>
        </div>

        {/* Big Center Play/Pause button when paused or hovered */}
        {(!isPlaying || isHovering) && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-white/95 text-slate-900 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all cursor-pointer z-10 backdrop-blur-xs"
            aria-label={isPlaying ? '일시정지' : '재생'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-slate-900" />
            ) : (
              <Play className="w-7 h-7 fill-slate-900 ml-1" />
            )}
          </button>
        )}

        {/* Bottom Video Controls Overlay */}
        <div
          className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 flex items-center justify-between text-white transition-opacity duration-200 z-10 ${
            isHovering || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="p-1 hover:text-blue-400 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
            <button
              onClick={handleJumpToSegment}
              className="p-1 hover:text-blue-400 transition-colors flex items-center gap-1 text-xs"
              title="검색 구간 시작으로 점프"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={toggleMute}
              className="p-1 hover:text-blue-400 transition-colors"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <span className="text-xs font-mono text-white/90">
              {formatTime(currentTime)} / {formatTime(totalVideoDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullScreen}
              className="p-1 hover:text-blue-400 transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Video Title & Metadata Information */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">
            {video.title}
          </h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
            <span className="font-semibold text-slate-700">{video.channelName}</span>
            <span>·</span>
            <span>{video.publishDate}</span>
            <span>·</span>
            <span>조회수 {video.views}</span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>공유</span>
          </button>
          <button
            onClick={() => setIsSaved(!isSaved)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              isSaved
                ? 'border-blue-600 bg-blue-50 text-blue-600'
                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-blue-600' : ''}`} />
            <span>{isSaved ? '저장됨' : '저장'}</span>
          </button>

          {showShareToast && (
            <div className="absolute right-0 -top-8 bg-slate-900 text-white text-xs px-2.5 py-1 rounded shadow-md whitespace-nowrap animate-fade-in">
              링크가 복사되었습니다!
            </div>
          )}
        </div>
      </div>

      {/* 3. "검색된 구간:" Highlight Timeline Card (Matches screenshot exactly) */}
      <div className="mt-4 p-4 rounded-xl bg-slate-50/70 border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
              <Target className="w-3 h-3 stroke-[2.5]" />
            </div>
            <span className="font-semibold text-slate-800">
              검색된 구간:
            </span>
            {selectedSegment ? (
              <button
                onClick={handleJumpToSegment}
                className="font-mono font-bold text-blue-600 hover:underline cursor-pointer bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60"
              >
                {formatTime(selectedSegment.start_time)} - {formatTime(selectedSegment.end_time)}
              </button>
            ) : (
              <span className="text-slate-500">전체 재생</span>
            )}
          </div>
          <span className="font-mono text-slate-500 text-xs">
            전체 {formatTime(totalVideoDuration)}
          </span>
        </div>

        {/* Timeline track with highlighted segment */}
        <div
          className="relative w-full h-3 bg-slate-200 rounded-full cursor-pointer group py-0.5 overflow-visible"
          onClick={handleTimelineClick}
          title="클릭하여 타임라인 이동"
        >
          {/* Base track */}
          <div className="absolute inset-0 rounded-full bg-slate-200 overflow-hidden">
            {/* Standard played progress */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-slate-300 transition-all duration-75"
              style={{ width: `${currentProgressPercent}%` }}
            />
            {/* Highlighted AI Matched Segment in Royal Blue */}
            {selectedSegment && (
              <div
                className="absolute top-0 bottom-0 bg-blue-600 shadow-xs"
                style={{
                  left: `${segmentStartPercent}%`,
                  width: `${segmentWidthPercent}%`,
                }}
              />
            )}
          </div>

          {/* Current playhead pointer */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full shadow-md pointer-events-none transition-all duration-75 z-10"
            style={{ left: `${currentProgressPercent}%` }}
          />
        </div>

        <p className="text-[11px] text-slate-500 mt-2.5">
          검색 키워드에 해당되는 구간이 타임라인 위에 파란색으로 하이라이트 표시됩니다.
        </p>
      </div>
    </div>
  );
};
