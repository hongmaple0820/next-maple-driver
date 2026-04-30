"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

const SPEED_OPTIONS = [
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "2", label: "2x" },
];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ src, className }: VideoPlayerProps) {
  const { t } = useI18n();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState("1");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [buffered, setBuffered] = useState(0);

  // Auto-hide controls after 3 seconds of inactivity
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, [clearHideTimer]);

  // Show controls and reset timer
  const showControlsAndReset = useCallback(() => {
    clearHideTimer();
    setShowControls(true);
  }, [clearHideTimer]);

  // Show controls on mouse move
  const handleMouseMove = useCallback(() => {
    showControlsAndReset();
    if (isPlaying && !isSeeking) {
      startHideTimer();
    }
  }, [isPlaying, isSeeking, showControlsAndReset, startHideTimer]);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying && !isSeeking) {
      clearHideTimer();
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 1000);
    }
  }, [isPlaying, isSeeking, clearHideTimer]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      // Auto-hide controls after 3s when playing
      clearHideTimer();
      setShowControls(true);
      hideTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };
    const onPause = () => {
      setIsPlaying(false);
      // Always show controls when paused
      clearHideTimer();
      setShowControls(true);
    };
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onLoadedMetadata = () => setDuration(video.duration);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  // Playback
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  // Seek
  const handleSeek = useCallback(
    (value: number[]) => {
      const video = videoRef.current;
      if (!video) return;
      const seekTime = value[0];
      video.currentTime = seekTime;
      setCurrentTime(seekTime);
    },
    []
  );

  const handleSeekStart = useCallback(() => {
    setIsSeeking(true);
  }, []);

  const handleSeekEnd = useCallback(
    (value: number[]) => {
      setIsSeeking(false);
      handleSeek(value);
      showControlsAndReset();
    },
    [handleSeek, showControlsAndReset]
  );

  // Volume
  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const vol = value[0];
    video.volume = vol;
    setVolume(vol);
    if (vol === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Speed
  const handleSpeedChange = useCallback((speed: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = parseFloat(speed);
    setPlaybackRate(speed);
  }, []);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Skip
  const skipBack = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 5);
  }, []);

  const skipForward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(video.duration, video.currentTime + 5);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          e.stopPropagation();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.stopPropagation();
          skipBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          e.stopPropagation();
          skipForward();
          break;
        case "m":
          e.preventDefault();
          e.stopPropagation();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          e.stopPropagation();
          toggleFullscreen();
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
      }
      showControlsAndReset();
    },
    [
      togglePlay,
      skipBack,
      skipForward,
      toggleMute,
      toggleFullscreen,
      handleVolumeChange,
      volume,
      showControlsAndReset,
    ]
  );

  // Click video to toggle play
  const handleVideoClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      togglePlay();
    },
    [togglePlay]
  );

  // Volume icon
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Progress percentage for buffered
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative group bg-black rounded-lg overflow-hidden select-none ${className ?? ""}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Video player"
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        className="w-full max-h-[70vh] rounded-lg"
        playsInline
        preload="metadata"
      >
        {t.browserNoVideo}
      </video>

      {/* Center play/pause overlay when paused */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20"
            onClick={handleVideoClick}
            aria-label={t.play}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-600/90 flex items-center justify-center shadow-lg backdrop-blur-sm hover:bg-emerald-500/90 transition-colors">
              <Play className="w-8 h-8 text-white ml-1" fill="white" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Controls overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-2 px-3"
          >
            {/* Progress/Seek bar */}
            <div className="relative mb-2 group/progress">
              {/* Buffered indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 bg-white/20 rounded-full pointer-events-none"
                style={{ width: `${bufferedPercent}%` }}
              />
              <Slider
                value={[currentTime]}
                min={0}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                onPointerDown={handleSeekStart}
                onPointerUp={() => handleSeekEnd([currentTime])}
                className="cursor-pointer [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:hover:h-2 [&_[data-slot=slider-track]]:transition-all [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:w-3.5 [&_[data-slot=slider-thumb]]:h-3.5 [&_[data-slot=slider-thumb]]:border-emerald-400 [&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:group-hover/progress:opacity-100 [&_[data-slot=slider-thumb]]:transition-opacity"
                aria-label="Seek"
              />
            </div>

            {/* Bottom controls row */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Play/Pause */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-8 w-8 shrink-0"
                onClick={togglePlay}
                aria-label={isPlaying ? t.pause : t.play}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" fill="white" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" fill="white" />
                )}
              </Button>

              {/* Skip back/forward */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-8 w-8 hidden sm:flex shrink-0"
                onClick={skipBack}
                aria-label={t.skipBack}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-8 w-8 hidden sm:flex shrink-0"
                onClick={skipForward}
                aria-label={t.skipForward}
              >
                <SkipForward className="w-4 h-4" />
              </Button>

              {/* Volume */}
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8"
                  onClick={toggleMute}
                  aria-label={isMuted ? t.unmute : t.mute}
                >
                  <VolumeIcon className="w-4 h-4" />
                </Button>
                <div className="w-0 overflow-hidden group-hover/vol:w-20 hover:w-20 transition-all duration-200 hidden sm:block">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={handleVolumeChange}
                    className="[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:w-3 [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:border-emerald-400"
                    aria-label={t.volume}
                  />
                </div>
              </div>

              {/* Time display */}
              <span className="text-white/90 text-xs font-mono tabular-nums whitespace-nowrap px-1">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Speed selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/20 h-8 px-2 gap-1 shrink-0 text-xs"
                    aria-label={t.playbackSpeed}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {playbackRate === "1" ? "1x" : `${playbackRate}x`}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[100px]">
                  <DropdownMenuRadioGroup
                    value={playbackRate}
                    onValueChange={handleSpeedChange}
                  >
                    {SPEED_OPTIONS.map((opt) => (
                      <DropdownMenuRadioItem
                        key={opt.value}
                        value={opt.value}
                        className="text-sm cursor-pointer"
                      >
                        {opt.value === "1" ? `${opt.label} (${t.speedNormal})` : opt.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Fullscreen */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-8 w-8 shrink-0"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? t.exitFullscreen : t.fullscreen}
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
