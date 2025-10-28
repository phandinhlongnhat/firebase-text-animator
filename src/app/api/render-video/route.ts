'use server';

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { z } from 'zod';
import { spawn } from 'child_process'; // Import the native spawn function
import { AnimationSegmentSchema } from '@/app/types';

// --- THE METHOD CHANGE: REMOVING FLUENT-FFMPEG ---
// As requested, we are changing the method entirely.
// We now bypass the `fluent-ffmpeg` library and use Node.js's native `spawn` function.
// This gives us absolute control over the command-line arguments and eliminates the library
// as a source of unpredictable behavior, especially with path and character escaping on Windows.

const ffmpegPath = process.env.FFMPEG_PATH;

// Minimal fonts.conf is still needed to prevent ffmpeg from crashing on startup.
const fontConfigPath = path.join(process.cwd(), 'src', 'app', 'api', 'render-video', 'fonts.conf');
process.env.FONTCONFIG_FILE = fontConfigPath;

const RequestBodySchema = z.object({
  mediaUrl: z.string().url(),
  segments: z.array(AnimationSegmentSchema),
});

// These escaping functions remain critical.
function escapeFFmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, `'\\''`)
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
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

    if (!ffmpegPath) {
      return NextResponse.json(
        { error: 'FFMPEG path not configured.' },
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

    // --- SPAWN IMPLEMENTATION ---
    const ffmpegArgs = [
      '-i', 'pipe:0', // Input from stdin
      '-vf', drawtextFilters,
      '-c:a', 'copy',
      '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4',
      'pipe:1' // Output to stdout
    ];

    console.log(`Spawning ffmpeg with args: ${ffmpegArgs.join(' ')}`);

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
    const passthrough = new PassThrough();

    // Pipe video data into ffmpeg's stdin
    inputStream.pipe(ffmpegProcess.stdin);

    // Pipe ffmpeg's stdout to our response stream
    ffmpegProcess.stdout.pipe(passthrough);

    // --- Robust Error Handling ---
    let stderr = '';
    ffmpegProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpegProcess.on('error', (err) => {
      console.error('Fatal: Failed to spawn ffmpeg process.', err);
      passthrough.destroy(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        console.log('ffmpeg process finished successfully.');
        passthrough.end(); // Properly close the stream
      } else {
        console.error(`ffmpeg process exited with code ${code}.`);
        console.error('ffmpeg stderr:\n', stderr);
        passthrough.destroy(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });
    
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
