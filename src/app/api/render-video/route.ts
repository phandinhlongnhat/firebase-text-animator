'use server';

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { AnimationSegmentSchema } from '@/app/types';
import { z } from 'zod';

// --- STRATEGIC INITIALIZATION (THE FINAL FIX) ---
// The root cause was a Fontconfig error on Windows, because ffmpeg couldn't find a default config file.
// The fix is to set the FONTCONFIG_FILE environment variable to point to a minimal, valid config file.
// CRUCIALLY, this must be done at the MODULE LEVEL (outside the handler) so it's set before
// fluent-ffmpeg initializes itself when the server starts. Setting it inside the handler is too late.
if (process.platform === 'win32') {
    const fontConfigPath = path.join(process.cwd(), 'src', 'app', 'api', 'render-video', 'fonts.conf');
    // This check is for safety, though we create the file in our process.
    try {
        require('fs').accessSync(fontConfigPath);
        process.env.FONTCONFIG_FILE = fontConfigPath;
    } catch (error) {
        console.error('CRITICAL: fonts.conf file not found. FFmpeg will likely fail.', error);
    }
}

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

// --- ROBUST ESCAPING FUNCTIONS ---
// These functions were developed through previous debugging steps and are essential for manually building
// a syntactically correct filter string on Windows, handling both file paths and text content with special characters.

function escapeFFmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, `'\\''`)
    .replace(/:/g, '\\:');
}

function escapeWindowsPathForDrawtext(p: string): string {
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
        { error: 'FFMPEG/FFPROBE paths not configured.' },
        { status: 500 }
      );
    }

    const response = await fetch(mediaUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch media from URL: ${mediaUrl}`);
    }
    const inputStream = Readable.fromWeb(response.body as any);

    let fontPath = path.join(process.cwd(), 'fonts', 'Roboto-Bold.ttf');
    if (process.platform === 'win32') {
      fontPath = escapeWindowsPathForDrawtext(fontPath);
    }

    const drawtextFilters = segments
      .map((segment) => {
        const escapedText = escapeFFmpegDrawtext(segment.text);
        const { startTime, endTime } = segment;
        return `drawtext=fontfile='${fontPath}':text='${escapedText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${startTime},${endTime})'`;
      })
      .join(',');

    const passthrough = new PassThrough();

    const ffmpegProcess = ffmpeg(inputStream)
      .outputOptions('-vf', drawtextFilters)
      .outputOptions('-c:a', 'copy')
      .outputOptions('-movflags', 'frag_keyframe+empty_moov')
      .toFormat('mp4');

    ffmpegProcess.on('start', (commandLine) => {
      console.log('Spawned Ffmpeg with command: ' + commandLine);
    });

    ffmpegProcess.on('error', (err, stdout, stderr) => {
      console.error('ffmpeg process error:', err.message);
      console.error('ffmpeg stderr:', stderr);
      passthrough.destroy(new Error(`ffmpeg failed: ${err.message}`));
    });

    ffmpegProcess.on('end', () => {
      console.log('ffmpeg process finished successfully.');
    });

    ffmpegProcess.pipe(passthrough, { end: true });

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp4');

    return new NextResponse(passthrough as any, { headers });
  } catch (error: any) {
    console.error('Server-side render failed:', error);
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred.' },
      { status: 500 }
    );
  }
}
