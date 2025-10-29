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
import * as htmlToImage from 'html-to-image';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

import type { AnimationSegment } from '@/app/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Slider } from './ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const FRAME_RATE = 25;

interface AnimationPreviewProps {
  data: AnimationSegment[] | null;
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
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState('');

  const ffmpegRef = useRef(new FFmpeg());
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const animationFrameId = useRef<number>();
  const { toast } = useToast();

  const isVideo = mediaType?.startsWith('video/');
  const isAudio = mediaType?.startsWith('audio/');
  
  const totalDuration = useMemo(() => {
    if (mediaRef.current?.duration && isFinite(mediaRef.current.duration)) {
      return mediaRef.current.duration;
    }
    if (data && data.length > 0) {
      return data.reduce((max, s) => Math.max(max, s.endTime), 0);
    }
    return 10;
  }, [data, mediaRef.current?.duration]);

  const loadFFmpeg = async () => {
    const ffmpeg = ffmpegRef.current;
    if (ffmpeg.loaded) {
      setFfmpegLoaded(true);
      return;
    }
    setRenderMessage('Loading FFmpeg engine...');
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });
     ffmpeg.on('progress', ({ progress, time }) => {
        setRenderProgress(progress * 100);
        setRenderMessage(`Encoding... Frame time: ${time/1000000}s`);
    });
    setFfmpegLoaded(true);
    setRenderMessage('FFmpeg loaded.');
  };

  useEffect(() => {
    loadFFmpeg();
  }, []);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.muted = isMuted;
    }
  }, [isMuted, mediaUrl]);

 const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


  const handleDownload = async () => {
    if (!data || !mediaUrl || isRendering || !animationContainerRef.current) return;
    
    if (!ffmpegLoaded) {
        toast({ title: "Rendering engine not ready", description: "FFmpeg is still loading, please wait.", variant: "destructive"});
        return;
    }

    setIsRendering(true);
    setIsPlaying(false);
    if(mediaRef.current) mediaRef.current.pause();

    const ffmpeg = ffmpegRef.current;
    const animationNode = animationContainerRef.current!;
    const duration = totalDuration;
    const numFrames = Math.floor(duration * FRAME_RATE);

    try {
        setRenderMessage('Capturing animation frames...');
        const framePromises: Promise<string>[] = [];

        if(mediaRef.current) mediaRef.current.style.opacity = '0';
        
        for (let i = 0; i < numFrames; i++) {
            const time = i / FRAME_RATE;
            const activeSegments = data.filter(segment => time >= segment.startTime && time < segment.endTime);
            setCurrentSegments(activeSegments);
            setKey(k => k + 1);
            
            await sleep(10); 
            
            const framePromise = htmlToImage.toPng(animationNode, {
                quality: 1,
                pixelRatio: 1,
                backgroundColor: 'transparent',
                fetchRequestInit: {
                    mode: 'cors',
                    cache: 'no-cache'
                }
            });
            framePromises.push(framePromise);
            setRenderProgress((i / numFrames) * 50); 
        }

        const frameDataUrls = await Promise.all(framePromises);

        if(mediaRef.current) mediaRef.current.style.opacity = '1';

        setRenderMessage('Writing frames to FFmpeg...');
        for (let i = 0; i < frameDataUrls.length; i++) {
            const dataUrl = frameDataUrls[i];
            const frameData = await fetchFile(dataUrl);
            await ffmpeg.writeFile(`frame-${String(i).padStart(5, '0')}.png`, frameData);
        }

        setRenderMessage('Encoding animation video...');
        setRenderProgress(50); 
        await ffmpeg.exec([
            '-framerate', String(FRAME_RATE),
            '-i', 'frame-%05d.png',
            '-c:v', 'libvpx-vp9', 
            '-pix_fmt', 'yuva420p',
            '-t', String(duration),
            '-y',
            'animation.webm'
        ]);

        setRenderMessage('Fetching source media...');
        const sourceFileData = await fetchFile(mediaUrl);
        const sourceFileName = isVideo ? 'input.mp4' : 'input.mp3';
        await ffmpeg.writeFile(sourceFileName, sourceFileData);

        setRenderMessage('Combining animation and source media...');
        if(isVideo) {
            await ffmpeg.exec([
                '-i', 'input.mp4',
                '-i', 'animation.webm',
                '-filter_complex', '[0:v][1:v]overlay', 
                '-c:a', 'copy', 
                '-y',
                'output.mp4'
            ]);
        } else { 
            await ffmpeg.exec([
                '-i', 'animation.webm',
                '-i', 'input.mp3',
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-shortest', 
                '-y',
                'output.mp4'
            ]);
        }

        setRenderMessage('Finalizing video...');
        const outputData = await ffmpeg.readFile('output.mp4');
        const dataBlob = new Blob([outputData], { type: 'video/mp4' });
        const url = URL.createObjectURL(dataBlob);

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
        setRenderProgress(0);
        setRenderMessage('');
        
        try {
            for (let i = 0; i < numFrames; i++) {
                if (await ffmpeg.pathExists(`frame-${String(i).padStart(5, '0')}.png`)) {
                    await ffmpeg.deleteFile(`frame-${String(i).padStart(5, '0')}.png`);
                }
            }
             if (await ffmpeg.pathExists('animation.webm')) await ffmpeg.deleteFile('animation.webm');
             if (await ffmpeg.pathExists('input.mp4')) await ffmpeg.deleteFile('input.mp4');
             if (await ffmpeg.pathExists('input.mp3')) await ffmpeg.deleteFile('input.mp3');
             if (await ffmpeg.pathExists('output.mp4')) await ffmpeg.deleteFile('output.mp4');
        } catch (e) {
            console.warn("Could not clean up some files in ffmpeg memory.");
        }
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
      const elapsed = (progress / 100) * totalDuration + 16 / 1000; 
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

  const animationContainerRef = useRef<HTMLDivElement>(null);

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
    if (isGeneratingAnimation) {
      return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-900/80 text-muted-foreground">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <p className="text-center">Generating your animation...</p>
        </div>
      );
    }
    if (!data && !isRendering) {
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
        <CardTitle className="font-headline">2. Preview &amp; Download</CardTitle>
        <ToggleGroup
          type="single"
          value={aspectRatio}
          onValueChange={(value: AspectRatio) => value &amp;&amp; setAspectRatio(value)}
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
          className={cn(
            'relative w-full overflow-hidden rounded-lg flex items-center justify-center transition-all',
            !isVideo &amp;&amp; 'bg-slate-900',
            aspectRatio === '16:9'
              ? 'aspect-video'
              : 'aspect-[9/16] max-h-[70vh] mx-auto'
          )}
        >
          <div ref={animationContainerRef} id="animation-container" className="absolute inset-0">
             {mediaUrl &amp;&amp; (isVideo || isAudio) &amp;&amp; (
              &lt;&gt;
                {isVideo &amp;&amp; (
                  <video
                    ref={mediaRef as React.Ref}
                    src={mediaUrl}
                    className="absolute top-0 left-0 h-full w-full object-cover"
                    playsInline
                    key={mediaUrl}
                    crossOrigin="anonymous"
                  />
                )}
                {isAudio &amp;&amp; !isVideo &amp;&amp; (
                  <audio
                    ref={mediaRef as React.Ref}
                    src={mediaUrl}
                    key={mediaUrl}
                    crossOrigin="anonymous"
                  />
                )}
              </>
            )}

            <div key={key} className={textClasses}>
              {currentSegments.map((segment) =&gt; {
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
                        {segment.text.split('').map((char, index) =&gt; (
                          <span
                            key={index}
                            className={cn(
                              segmentLetterAnimationType === 'bounce' &amp;&amp;
                                'letter-bounce',
                              segmentLetterAnimationType === 'rain' &amp;&amp;
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
          </div>
          {renderStatus()}
        </div>
        {isRendering &amp;&amp; (
            
                
                    
                    Rendering Video...
                    {renderMessage}
                
                
            
        )}

        {data &amp;&amp; (
          
            
              
                
                  
                    
                  ) : (
                    
                  )}
                
                
                  {isPlaying ? (
                    
                  ) : (
                    
                  )}
                
                
                  
                
                
                  
                    {new Date(((progress / 100) * totalDuration) * 1000)
                      .toISOString()
                      .substr(14, 5)}
                  /
                  
                    {totalDuration &gt; 0
                      ? new Date(totalDuration * 1000)
                          .toISOString()
                          .substr(14, 5)
                      : '00:00'}
                  
                
                {(isVideo || isAudio) &amp;&amp; (
                  
                    {isMuted ? (
                      
                    ) : (
                      
                    )}
                  
                )}
              
            
            
              {isRendering ? (
                
              ) : (
                
              )}
              {isRendering ? 'Rendering...' : 'Download Video'}
            
             {!ffmpegLoaded &amp;&amp; !isRendering &amp;&amp; }
          
        )}
      </CardContent>
    </Card>
  );
}
