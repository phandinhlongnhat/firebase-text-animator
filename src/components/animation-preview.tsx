'use client';

import {
  DownloadCloud,
  Loader2,
  Monitor,
  Pause,
  Play,
  Rewind,
  Smartphone,
  Sparkles,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AnimationSegment } from '@/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Slider } from './ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';

interface AnimationPreviewProps {
  data: AnimationSegment[] | null;
  isGeneratingTimings: boolean;
  isGeneratingAnimation: boolean;
  mediaUrl?: string | null;
  mediaType?: string | null;
  srt?: string;
}

type AspectRatio = '9:16' | '16:9';

const getAnimationClasses = (animations: string[]) => {
  const classes: string[] = [];
  if (animations.includes('fadeIn')) classes.push('animation-fade-in');
  if (animations.includes('slide')) classes.push('animation-slide-in');
  if (animations.includes('flash')) classes.push('animation-flash');
  if (animations.includes('zoom-in')) classes.push('animation-zoom-in');
  if (animations.includes('shake')) classes.push('animation-shake');
  if (animations.includes('blur-in')) classes.push('animation-blur-in');
  if (animations.includes('karaoke-fill'))
    classes.push('animation-karaoke-fill');
  return classes.join(' ');
};

export function AnimationPreview({
  data,
  isGeneratingTimings,
  isGeneratingAnimation,
  mediaUrl,
  mediaType,
}: AnimationPreviewProps) {
  const [currentSegments, setCurrentSegments] = useState<AnimationSegment[]>(
    []
  );
  const [key, setKey] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const [isRendering, setIsRendering] = useState(false);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const animationFrameId = useRef<number>();
  const { toast } = useToast();

  const isVideo = mediaType?.startsWith('video/');
  const isAudio = mediaType?.startsWith('audio/');
  const isGenerating = isGeneratingAnimation || isGeneratingTimings;

  const totalDuration = useMemo(() => {
    if (mediaRef.current?.duration && isFinite(mediaRef.current.duration)) {
      return mediaRef.current.duration;
    }
    if (data && data.length > 0) {
      return data.reduce((max, s) => Math.max(max, s.endTime), 0);
    }
    return 10;
  }, [data, mediaRef.current?.duration]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.muted = isMuted;
    }
  }, [isMuted, mediaUrl]);

  const handleDownload = async () => {
    if (!data || !mediaUrl || isRendering) return;

    const currentDuration = mediaRef.current?.duration;
    if (!currentDuration || !isFinite(currentDuration)) {
      toast({
        title: 'Cannot Render Video',
        description:
          'Media duration is not available yet. Please wait for the media to load fully and try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsRendering(true);

    try {
      const response = await fetch('/api/render-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaUrl,
          segments: data,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to render video on server.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aivos-animation-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: 'Render Complete!',
        description: 'Your video has been downloaded.',
      });

    } catch (e: any) {
      console.error("Render failed:", e);
      toast({
        title: 'Render Failed',
        description: e.message || 'An unknown error occurred during rendering.',
        variant: 'destructive',
      });
    } finally {
      setIsRendering(false);
    }
  };

  const updateCurrentSegments = useCallback(() => {
    if (!isPlaying) return;

    const media = mediaRef.current;
    let currentTime;

    if (media && isFinite(media.duration)) {
      currentTime = media.currentTime;
      if (isFinite(currentTime) && totalDuration > 0) {
        setProgress((currentTime / totalDuration) * 100);
      }

      if (media.ended) {
        setIsPlaying(false);
        setProgress(100);
      }
    } else {
      const elapsed = (progress / 100) * totalDuration + 16 / 1000; // rough 60fps
      currentTime = elapsed;
      if (currentTime >= totalDuration) {
        setIsPlaying(false);
        setProgress(100);
        currentTime = totalDuration;
      } else {
        if (isFinite(currentTime) && totalDuration > 0) {
          setProgress((currentTime / totalDuration) * 100);
        }
      }
    }

    if (typeof currentTime !== 'number' || !isFinite(currentTime)) {
      animationFrameId.current = requestAnimationFrame(updateCurrentSegments);
      return;
    }

    const activeSegments =
      data?.filter(
        (segment) =>
          currentTime >= segment.startTime && currentTime < segment.endTime
      ) || [];

    setCurrentSegments((prevSegments) => {
      const prevIds = prevSegments.map((s) => s.text + s.startTime).join(',');
      const activeIds = activeSegments
        .map((s) => s.text + s.startTime)
        .join(',');
      if (prevIds !== activeIds) {
        setKey((k) => k + 1);
        return activeSegments;
      }
      return prevSegments;
    });

    animationFrameId.current = requestAnimationFrame(updateCurrentSegments);
  }, [data, isPlaying, totalDuration, progress]);

  useEffect(() => {
    if (isPlaying) {
      animationFrameId.current = requestAnimationFrame(updateCurrentSegments);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying, updateCurrentSegments]);

  useEffect(() => {
    setProgress(0);
    setCurrentSegments([]);
    setIsPlaying(false);
    if (mediaRef.current) mediaRef.current.currentTime = 0;
  }, [data, mediaUrl]);

  const textClasses = cn(
    'font-bold font-headline text-white',
    'drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]',
    'absolute inset-0 z-10 text-center flex flex-col items-center justify-center gap-2 w-full px-4',
    aspectRatio === '16:9' ? 'text-4xl' : 'text-3xl'
  );

  const handlePlayPause = () => {
    const media = mediaRef.current;
    if (media) {
      if (isPlaying) {
        media.pause();
        setIsPlaying(false);
      } else {
        if (media.ended) {
          media.currentTime = 0;
          setProgress(0);
        }
        media
          .play()
          .then(() => setIsPlaying(true))
          .catch(console.error);
      }
    } else {
      if (progress >= 100) {
        setProgress(0);
        setCurrentSegments([]);
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (value: number[]) => {
    const newProgress = value[0];
    setProgress(newProgress);
    if (totalDuration > 0) {
      const newTime = (newProgress / 100) * totalDuration;

      if (!isFinite(newTime)) return;

      const media = mediaRef.current;
      if (media && isFinite(newTime)) {
        media.currentTime = newTime;
      }
      const activeSegments =
        data?.filter(
          (segment) => newTime >= segment.startTime && newTime < segment.endTime
        ) || [];
      if (
        activeSegments.length !== currentSegments.length ||
        activeSegments.some((s, i) => s.text !== currentSegments[i].text)
      ) {
        setKey((k) => k + 1);
        setCurrentSegments(activeSegments);
      }
    }
  };

  const handleRewind = () => {
    const media = mediaRef.current;
    if (media) {
      media.currentTime = 0;
    }
    setProgress(0);
    setCurrentSegments([]);
    setIsPlaying(false);
  };

  const renderStatus = () => {
    if (isGeneratingTimings) {
      return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-900/80 text-muted-foreground">
          <Timer className="h-16 w-16" />
          <p className="text-center">Generating timings...</p>
        </div>
      );
    }
    if (isGeneratingAnimation) {
      return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-900/80 text-muted-foreground">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-center">Generating your animation...</p>
        </div>
      );
    }
    if (isRendering) {
      return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-900/80 text-white">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-center">Rendering video on server...</p>
           <p className="text-sm text-muted-foreground">This may take a few moments.</p>
        </div>
      );
    }
    if (!data) {
      return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <Sparkles className="h-16 w-16" />
          <p className="text-center">Your animation will appear here</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col sticky top-8">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-headline">3. Preview & Download</CardTitle>
        <ToggleGroup
          type="single"
          value={aspectRatio}
          onValueChange={(value: AspectRatio) => value && setAspectRatio(value)}
          aria-label="Aspect Ratio"
        >
          <ToggleGroupItem value="9:16" aria-label="9:16">
            <Smartphone className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="16:9" aria-label="16:9">
            <Monitor className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center space-y-4">
        <div
          id="animation-container"
          className={cn(
            'relative w-full overflow-hidden rounded-lg flex items-center justify-center transition-all',
            !isVideo && 'bg-slate-900',
            aspectRatio === '16:9'
              ? 'aspect-video'
              : 'aspect-[9/16] max-h-[70vh] mx-auto'
          )}
        >
          {mediaUrl && (isVideo || isAudio) && (
            <>
              {isVideo && (
                <video
                  ref={mediaRef as React.Ref<HTMLVideoElement>}
                  src={mediaUrl}
                  className="absolute top-0 left-0 h-full w-full object-cover"
                  playsInline
                  key={mediaUrl}
                  crossOrigin="anonymous"
                />
              )}
              {isAudio && !isVideo && (
                <audio
                  ref={mediaRef as React.Ref<HTMLAudioElement>}
                  src={mediaUrl}
                  key={mediaUrl}
                  crossOrigin="anonymous"
                />
              )}
            </>
          )}

          <div key={key} className={textClasses}>
            {currentSegments.map((segment) => {
              const segmentLetterAnimationType = segment.animations.includes(
                'bounceLetters'
              )
                ? 'bounce'
                : segment.animations.includes('rainText')
                ? 'rain'
                : null;

              const animationDuration = segment.endTime - segment.startTime;
              const style = segment.animations.includes('karaoke-fill')
                ? ({
                    '--animation-duration': `${animationDuration}s`,
                  } as React.CSSProperties)
                : {};
              const animationClass = getAnimationClasses(segment.animations);

              return (
                <div
                  key={segment.startTime}
                  className={cn(
                    segment.animations.includes('glow-text')
                      ? 'animation-glow-text'
                      : ''
                  )}
                >
                  {segmentLetterAnimationType ? (
                    <h2 className={cn(animationClass)}>
                      {segment.text.split('').map((char, index) => (
                        <span
                          key={index}
                          className={cn(
                            segmentLetterAnimationType === 'bounce' &&
                              'letter-bounce',
                            segmentLetterAnimationType === 'rain' &&
                              'letter-rain'
                          )}
                          style={
                            {
                              '--letter-delay': `${index * 0.05}s`,
                            } as React.CSSProperties
                          }
                        >
                          {char === ' ' ? '\u00A0' : char}
                        </span>
                      ))}
                    </h2>
                  ) : (
                    <h2
                      className={cn(animationClass, 'whitespace-normal')}
                      style={style}
                    >
                      {segment.text}
                    </h2>
                  )}
                </div>
              );
            })}
          </div>

          {renderStatus()}
        </div>
        {data && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRewind}
                  disabled={isGenerating || isRendering}
                >
                  <Rewind className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayPause}
                  disabled={isGenerating || isRendering}
                >
                  {isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6" />
                  )}
                </Button>
                <Slider
                  value={[progress]}
                  onValueChange={handleSeek}
                  disabled={isGenerating || isRendering || totalDuration === 0}
                  className="w-full"
                />
                <div className="text-xs font-mono text-muted-foreground min-w-[90px] text-center">
                  <span>
                    {new Date(((progress / 100) * totalDuration) * 1000)
                      .toISOString()
                      .substr(14, 5)}
                  </span>{' '}
                  /
                  <span>
                    {totalDuration > 0
                      ? new Date(totalDuration * 1000)
                          .toISOString()
                          .substr(14, 5)
                      : '00:00'}
                  </span>
                </div>
                {(isVideo || isAudio) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMuted(!isMuted)}
                    disabled={isGenerating || isRendering}
                  >
                    {isMuted ? (
                      <VolumeX className="h-5 w-5" />
                    ) : (
                      <Volume2 className="h-5 w-5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
            <Button
              onClick={handleDownload}
              disabled={isGenerating || isRendering || !mediaUrl}
              size="lg"
            >
              {isRendering ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DownloadCloud className="mr-2 h-4 w-4" />
              )}
              {isRendering ? 'Rendering...' : 'Download Video'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
