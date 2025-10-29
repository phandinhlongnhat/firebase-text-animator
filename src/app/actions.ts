'use server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

import type { AnimationSegment } from './types';

function parseTimeToSeconds(time: string): number {
  const parts = time.replace(',', '.').split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseFloat(parts[2]);
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseSrt(srtContent: string): Omit<AnimationSegment, 'emotion' | 'animations'>[] {
  const segments: Omit<AnimationSegment, 'emotion' | 'animations'>[] = [];
  const blocks = srtContent.trim().replace(/\r\n/g, '\n').split('\n\n');

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 2) continue;

    let timeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timeLineIndex = i;
        break;
      }
    }

    if (timeLineIndex === -1) continue;

    const timeLine = lines[timeLineIndex];
    const [startStr, endStr] = timeLine.split(' --> ');
    const textLines = lines.slice(timeLineIndex + 1);

    if (!startStr || !endStr || textLines.length === 0) continue;

    const startTime = parseTimeToSeconds(startStr.trim());
    const endTime = parseTimeToSeconds(endStr.trim());
    const text = textLines.join('\n').trim();

    if (isFinite(startTime) && isFinite(endTime) && text) {
      segments.push({
        startTime,
        endTime,
        text,
      });
    }
  }

  return segments;
}


export async function generateAnimationFromSrtAction(
  srt: string
): Promise<{
  data: AnimationSegment[] | null;
  error: string | null;
}> {
  try {
    const srtSegments = parseSrt(srt);
    if (srtSegments.length === 0) {
      return {
        data: null,
        error: 'Could not parse SRT content. Please check the format.',
      };
    }
    
    // Simplified: No AI analysis, just assign a default animation
    const enrichedSegments: AnimationSegment[] = srtSegments.map(srtSeg => {
      return {
        ...srtSeg,
        emotion: 'neutral', // Default emotion
        animations: ['fadeIn'], // Default animation
      };
    });

    return { data: enrichedSegments, error: null };
  } catch (e: any) {
    console.error(e);
    const errorMessage = e.message || "An unknown error occurred.";
    return {
      data: null,
      error: `Failed to process SRT. ${errorMessage}`,
    };
  }
}


export async function renderVideoOnServer(formData: FormData): Promise<{ videoUrl?: string, error?: string }> {
  const mediaFile = formData.get('mediaFile') as File | null;
  const frameDataUrls = formData.getAll('frames') as string[];
  const duration = parseFloat(formData.get('duration') as string);
  const frameRate = parseInt(formData.get('frameRate') as string, 10);
  const isVideo = formData.get('isVideo') === 'true';

  if (!mediaFile || frameDataUrls.length === 0) {
    return { error: 'Missing media file or animation frames.' };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aivos-render-'));
  const outputFilename = `output-${Date.now()}.mp4`;
  const outputPath = path.join(tempDir, outputFilename);

  try {
    // 1. Save all frames to temp directory
    for (let i = 0; i < frameDataUrls.length; i++) {
      const dataUrl = frameDataUrls[i];
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const framePath = path.join(tempDir, `frame-${String(i).padStart(5, '0')}.png`);
      await fs.writeFile(framePath, base64Data, 'base64');
    }

    // 2. Save media file
    const mediaBuffer = Buffer.from(await mediaFile.arrayBuffer());
    const mediaPath = path.join(tempDir, mediaFile.name);
    await fs.writeFile(mediaPath, mediaBuffer);
    
    // 3. Create animation video from frames
    const animationVideoPath = path.join(tempDir, 'animation.webm');
    await new Promise<void>((resolve, reject) => {
        ffmpeg()
            .input(path.join(tempDir, 'frame-%05d.png'))
            .inputFPS(frameRate)
            .videoCodec('libvpx-vp9')
            .addOption('-pix_fmt', 'yuva420p') // for transparency
            .duration(duration)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`FFmpeg error creating animation: ${err.message}`)))
            .save(animationVideoPath);
    });

    // 4. Combine and render
    await new Promise<void>((resolve, reject) => {
        const command = ffmpeg().input(mediaPath);

        if (isVideo) {
            command
                .input(animationVideoPath)
                .complexFilter('[0:v][1:v]overlay[v]')
                .map('[v]')
                .map('[0:a]?') // use audio from original video if it exists
                .videoCodec('libx264')
                .addOption('-pix_fmt', 'yuv420p') // standard mp4 pixel format
                .outputOptions('-preset', 'fast')
        } else { // Audio source
             command
                .input(animationVideoPath)
                .complexFilter('[1:v]format=yuv420p[v]') // convert animation to standard pixel format
                .map('[v]')
                .map('[0:a]') // use the audio from the input
                .videoCodec('libx264')
                .outputOptions('-preset', 'fast')
                .shortest(); // end when the shortest input (audio) ends
        }

        command
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`FFmpeg error combining media: ${err.message}`)))
            .save(outputPath);
    });

    // 5. Read the final video and return as data URL
    const videoBuffer = await fs.readFile(outputPath);
    const videoBase64 = videoBuffer.toString('base64');
    
    return { videoUrl: `data:video/mp4;base64,${videoBase64}` };

  } catch (error: any) {
    console.error('Server rendering failed:', error);
    return { error: error.message || 'An unknown error occurred on the server.' };
  } finally {
    // 6. Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
