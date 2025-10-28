'use server';

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { AnimationSegmentSchema } from '@/app/types';
import { z } from 'zod';

const ffmpegPath = process.env.FFMPEG_PATH;
const ffprobePath = process.env.FFPROBE_PATH;

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath);
}

const RequestBodySchema = z.object({
  mediaUrl: z.string().url(),
  segments: z.array(AnimationSegmentSchema),
});

// Helper to escape text for ffmpeg's drawtext filter on all platforms
function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, `\\\\\\\\\\\'`)
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '\\\\%');
}

// Helper to escape a Windows path for the drawtext filter
// e.g., C:\Users\user\font.ttf -> C\\:/Users/user/font.ttf
function escapeWindowsPathForFFmpeg(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = RequestBodySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validation.error.format() },
        { status: 400 }
      );
    }
    const { mediaUrl, segments } = validation.data;
    
    if (!ffmpegPath || !ffprobePath) {
       return NextResponse.json({
        error:
          'FFMPEG/FFPROBE paths not configured on server. Please set FFMPEG_PATH and FFPROBE_PATH environment variables.',
      }, { status: 500 });
    }

    const response = await fetch(mediaUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch media from URL: ${mediaUrl}`);
    }
    const inputStream = Readable.fromWeb(response.body as any);
    const tempInputPath = path.join(os.tmpdir(), `aivos-input-${Date.now()}`);
    const tempOutputPath = path.join(os.tmpdir(), `aivos-output-${Date.now()}.mp4`);
    
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempInputPath);
        inputStream.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    const fontFileName = 'Roboto-Bold.ttf';
    let fontPath = path.join(process.cwd(), 'fonts', fontFileName);

    // If on Windows, apply the special path escaping
    if (process.platform === 'win32') {
      fontPath = escapeWindowsPathForFFmpeg(fontPath);
    }

    const drawtextFilters = segments.map((segment) => {
      const text = escapeFFmpegText(segment.text);
      const { startTime, endTime } = segment;
      // TODO: Add more complex animation logic here
      return `drawtext=fontfile='${fontPath}':text='${text}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${startTime},${endTime})'`;
    }).join(',');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempInputPath)
        .videoFilters(drawtextFilters)
        .outputOptions('-c:a', 'copy')
        .toFormat('mp4')
        .on('error', (err) => {
            console.error('ffmpeg error:', err.message);
            reject(new Error(`ffmpeg failed: ${err.message}`));
        })
        .on('end', () => {
            resolve();
        })
        .save(tempOutputPath);
    });

    const stats = await fs.promises.stat(tempOutputPath);
    const videoStream = fs.createReadStream(tempOutputPath);

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');
    headers.set('Content-Length', stats.size.toString());

    const responseStream = new ReadableStream({
      start(controller) {
        videoStream.on('data', (chunk) => controller.enqueue(chunk));
        videoStream.on('end', () => {
          controller.close();
          fs.promises.unlink(tempInputPath).catch(e => console.error("Failed to clean up input file:", e));
          fs.promises.unlink(tempOutputPath).catch(e => console.error("Failed to clean up output file:", e));
        });
        videoStream.on('error', (err) => {
          controller.error(err);
          fs.promises.unlink(tempInputPath).catch(e => console.error("Failed to clean up input file:", e));
          fs.promises.unlink(tempOutputPath).catch(e => console.error("Failed to clean up output file:", e));
        });
      },
    });

    return new NextResponse(responseStream, { headers });

  } catch (error: any) {
    console.error('Server-side render failed:', error);
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred during rendering.' },
      { status: 500 }
    );
  }
}
