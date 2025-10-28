'use server';

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { AnimationSegmentSchema } from '@/app/types';
import { z } from 'zod';

// --- THE DEFINITIVE & ROBUST HYBRID SOLUTION ---
// This combines all successful lessons learned from the debugging process.

// 1. `.env.local` points FONTCONFIG_FILE to a minimal `fonts.conf`.
//    - PURPOSE: Solves the initial `Cannot load default config file` error.
//    - The `fonts.conf` itself does nothing else.

// 2. We MANUALLY build the filter string.
//    - PURPOSE: Solves the `Error parsing a filter description` error by bypassing
//      the unreliable escaping of the fluent-ffmpeg library.

// 3. We MANUALLY provide an escaped, absolute path to the font file.
//    - PURPOSE: Solves the `Cannot find a valid font` error by telling ffmpeg exactly
//      where the font is, removing all reliance on fontconfig's search mechanism.

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

// --- PROVEN-TO-WORK ESCAPING FUNCTIONS ---

function escapeFFmpegDrawtext(text: string): string {
  // Escapes single quotes and other special characters for the `text` option.
  return text
    .replace(/\\/g, '\\\\')        // 1. Escape backslashes
    .replace(/'/g, `'\\''`)       // 2. Escape single quotes
    .replace(/:/g, '\\:')          // 3. Escape colons
    .replace(/%/g, '\\%');         // 4. Escape percentage signs
}

function escapeWindowsPathForFFmpeg(p: string): string {
  // Escapes a Windows path for use in any ffmpeg filter.
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
    
    const fontPath = path.join(process.cwd(), 'fonts', 'Roboto-Bold.ttf');
    const escapedFontPath = escapeWindowsPathForFFmpeg(fontPath);

    const drawtextFilters = segments
      .map((segment) => {
        const escapedText = escapeFFmpegDrawtext(segment.text);
        return `drawtext=fontfile='${escapedFontPath}':text='${escapedText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${segment.startTime},${segment.endTime})'`;
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
