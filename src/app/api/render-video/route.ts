'use server';

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { Readable, PassThrough } from 'stream';
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

function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\\\:')
    .replace(/%/g, '\\\\%')
    .replace(/'/g, `\\\\\\\\\\\'`);
}

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
      return NextResponse.json(
        {
          error:
            'FFMPEG/FFPROBE paths not configured on server. Please set FFMPEG_PATH and FFPROBE_PATH environment variables.',
        },
        { status: 500 }
      );
    }

    const response = await fetch(mediaUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch media from URL: ${mediaUrl}`);
    }
    const inputStream = Readable.fromWeb(response.body as any);

    const fontFileName = 'Roboto-Bold.ttf';
    let fontPath = path.join(process.cwd(), 'fonts', fontFileName);

    if (process.platform === 'win32') {
      fontPath = escapeWindowsPathForFFmpeg(fontPath);
    }

    const drawtextFilters = segments
      .map((segment) => {
        const text = escapeFFmpegText(segment.text);
        const { startTime, endTime } = segment;
        return `drawtext=fontfile='${fontPath}':text='${text}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${startTime},${endTime})'`;
      })
      .join(',');

    const fontConfigPath = path.join(
      process.cwd(),
      'src',
      'app',
      'api',
      'render-video',
      'fonts.conf'
    );
    if (process.platform === 'win32') {
      process.env.FONTCONFIG_FILE = fontConfigPath;
    }

    const passthrough = new PassThrough();

    const ffmpegProcess = ffmpeg(inputStream)
      .videoFilters(drawtextFilters)
      .outputOptions('-c:a', 'copy')
      .outputOptions('-movflags', 'frag_keyframe+empty_moov')
      .toFormat('mp4');

    ffmpegProcess.on('error', (err, stdout, stderr) => {
      console.error('ffmpeg process error:', err.message);
      console.error('ffmpeg stderr:', stderr);
      passthrough.destroy(new Error(`ffmpeg failed: ${err.message}`));
    });

    ffmpegProcess.pipe(passthrough, { end: true });

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');

    return new NextResponse(passthrough as any, { headers });
  } catch (error: any) {
    console.error('Server-side render failed:', error);
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred during rendering.' },
      { status: 500 }
    );
  }
}
