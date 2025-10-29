'use server';

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { z } from 'zod';
import { spawn } from 'child_process';
import fs from 'fs/promises';

// --- DYNAMIC FONT MANAGEMENT ---
// This new approach allows for easy expansion of fonts.
// 1. Fonts are now stored in `public/fonts`.
// 2. We dynamically scan this directory to build a map of available fonts.
// 3. The API now accepts a `fontFamily` parameter.
// 4. The hardcoded Windows font logic is removed.

const ffmpegPath = process.env.FFMPEG_PATH;
const fontConfigPath = path.join(process.cwd(), 'src', 'app', 'api', 'render-video', 'fonts.conf');
process.env.FONTCONFIG_FILE = fontConfigPath;

// --- FONT DISCOVERY (RUNS ONCE AT STARTUP) ---
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
let fontMap: Map<string, string> = new Map();

async function initializeFonts() {
  try {
    const fontFiles = await fs.readdir(fontsDir);
    for (const file of fontFiles) {
      if (file.toLowerCase().endsWith('.ttf')) {
        const fontFamily = path.basename(file, '.ttf');
        fontMap.set(fontFamily.toLowerCase(), path.join(fontsDir, file));
      }
    }
    console.log('Initialized fonts:', Array.from(fontMap.keys()));
  } catch (error) {
    console.error('Error initializing fonts:', error);
    // Fallback to a default font if scanning fails
    const defaultFontPath = path.join(fontsDir, 'Roboto-Bold.ttf');
    fontMap.set('roboto-bold', defaultFontPath);
  }
}

// Initialize fonts when the server starts
initializeFonts();

const AnimationSegmentSchemaWithFont = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  fontFamily: z.string().optional(), // New optional field
});

const RequestBodySchema = z.object({
  mediaUrl: z.string().url(),
  segments: z.array(AnimationSegmentSchemaWithFont),
});

// Escaping functions remain unchanged and essential
function escapeFFmpegDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, `'\\''`).replace(/:/g, '\\:').replace(/%/g, '\\%');
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
      return NextResponse.json({ error: 'FFMPEG path not configured.' }, { status: 500 });
    }

    const response = await fetch(mediaUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch media from URL: ${mediaUrl}`);
    }
    const inputStream = Readable.fromWeb(response.body as any);

    const defaultFontPath = fontMap.get('roboto-bold') || Array.from(fontMap.values())[0];
    if (!defaultFontPath) {
      throw new Error('No fonts found in public/fonts directory.');
    }

    const drawtextFilters = segments
      .map((segment) => {
        const fontFamily = segment.fontFamily?.toLowerCase() || 'roboto-bold';
        const fontPath = fontMap.get(fontFamily) || defaultFontPath;
        const escapedFontPath = escapeWindowsPathForFFmpeg(fontPath);
        const escapedText = escapeFFmpegDrawtext(segment.text);
        return `drawtext=fontfile='${escapedFontPath}':text='${escapedText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${segment.startTime},${segment.endTime})'`;
      })
      .join(',');

    const ffmpegArgs = [
      '-i', 'pipe:0',
      '-vf', drawtextFilters,
      '-c:a', 'copy',
      '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4',
      'pipe:1',
    ];

    console.log(`Spawning ffmpeg with args: ${ffmpegArgs.join(' ')}`);

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
    const passthrough = new PassThrough();

    inputStream.pipe(ffmpegProcess.stdin);
    ffmpegProcess.stdout.pipe(passthrough);

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
        passthrough.end();
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
