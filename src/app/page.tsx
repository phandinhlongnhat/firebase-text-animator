'use client';

import { useState, useRef } from 'react';
import {
  Loader2,
  FileAudio,
  FileVideo,
  Sparkles,
  DownloadCloud,
} from 'lucide-react';
import dynamic from 'next/dynamic';

import { generateAnimationFromSrtAction } from '@/app/actions';
import type { AnimationSegment } from '@/app/types';
import { Logo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ThemeToggle } from '@/components/theme-toggle';

const AnimationPreview = dynamic(
  () =>
    import('@/components/animation-preview').then(
      (mod) => mod.AnimationPreview
    ),
  {
    ssr: false,
    loading: () => (
      <Card className="flex flex-col sticky top-8">
        <CardHeader>
          <CardTitle className="font-headline">2. Preview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-center items-center space-y-4">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-center">Loading Preview...</p>
          </div>
        </CardContent>
      </Card>
    ),
  }
);

export default function Home() {
  const [srt, setSrt] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);

  const [animationData, setAnimationData] = useState<AnimationSegment[] | null>(
    null
  );
  const [isGeneratingAnimation, setIsGeneratingAnimation] = useState(false);

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        !selectedFile.type.startsWith('audio/') &&
        !selectedFile.type.startsWith('video/')
      ) {
        toast({
          title: 'Invalid File Type',
          description: 'Please upload an audio or video file.',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
      setAnimationData(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        setFileDataUrl(event.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleGenerateAnimation = async () => {
    if (!srt) {
      toast({
        title: 'Error',
        description:
          'Please paste SRT content before animating.',
        variant: 'destructive',
      });
      return;
    }
     if (!file) {
      toast({
        title: 'Error',
        description:
          'Please upload a media file to preview the animation.',
        variant: 'destructive',
      });
      return;
    }
    setIsGeneratingAnimation(true);
    setAnimationData(null);

    const result = await generateAnimationFromSrtAction(srt);

    if (result?.error) {
      toast({
        title: 'Error Generating Animation',
        description: result.error,
        variant: 'destructive',
      });
    } else if (result?.data) {
      setAnimationData(result.data);
    }

    setIsGeneratingAnimation(false);
  };


  return (
    <main className="container mx-auto p-4 md:p-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Logo className="h-10 w-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold font-headline text-primary">
              AIVOS
            </h1>
            <p className="text-muted-foreground">
             Bring your subtitles to life with animation.
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="grid gap-8 content-start">
          <Card>
            <CardHeader>
              <CardTitle className="font-headline flex items-center gap-2">
                <DownloadCloud className="h-5 w-5" /> 1. Upload & Paste
              </CardTitle>
              <CardDescription>
                Upload your media file for the preview, and paste the corresponding SRT content.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex min-h-[100px] flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted p-4">
                <Label
                  htmlFor="file-upload"
                  className="cursor-pointer text-center"
                >
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      {file.type.startsWith('video/') ? (
                        <FileVideo className="h-10 w-10 text-muted-foreground" />
                      ) : (
                        <FileAudio className="h-10 w-10 text-muted-foreground" />
                      )}
                      <span className="font-medium">{file.name}</span>
                      <span className="text-sm text-muted-foreground">
                        Click to change file
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileAudio className="h-10 w-10" />
                      <p>Click to upload audio or video for preview</p>
                      <p className="text-xs">(mp3, mp4, wav, etc.)</p>
                    </div>
                  )}
                </Label>
                <Input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  accept="audio/*,video/*"
                  onChange={handleFileChange}
                />
              </div>


              <div>
                <Label htmlFor="srt-input" >
                  Paste SRT Content
                </Label>
                <Textarea
                  id="srt-input"
                  value={srt}
                  onChange={(e) => setSrt(e.target.value)}
                  className="min-h-[250px] font-mono text-sm mt-2"
                  placeholder="1\n00:00:01,234 --> 00:00:05,678\nHello world..."
                />
              </div>
                 <Button
                onClick={handleGenerateAnimation}
                disabled={!srt || !file || isGeneratingAnimation}
                size="lg"
              >
                {isGeneratingAnimation ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Analyze & Animate
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-8">
          <AnimationPreview
            key={`${file?.name}`}
            data={animationData}
            isGeneratingAnimation={isGeneratingAnimation}
            mediaFile={file}
            mediaUrl={fileDataUrl}
            mediaType={file?.type}
          />
        </div>
      </div>
    </main>
  );
}
