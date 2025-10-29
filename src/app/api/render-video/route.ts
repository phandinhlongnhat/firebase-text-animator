'use server';

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { Readable, PassThrough } from 'stream';
import { z } from 'zod';
import { spawn } from 'child_process';
import fs from 'fs/promises';

// --- FINAL, ROBUST FIX for 0xC0000005 CRASH ---
const ffmpegPath = process.env.FFMPEG_PATH;
const fontConfigPath = path.join(process.cwd(), 'src', 'app', 'api', 'render-video', 'fonts.conf');

async function initializeFonts(): Promise<Map<string, string>> {
  const fontMap = new Map<string, string>();
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  try {
    const fontFiles = await fs.readdir(fontsDir);
    for (const file of fontFiles) {
      if (file.toLowerCase().endsWith('.ttf')) {
        const fontFamily = path.basename(file, '.ttf');
        fontMap.set(fontFamily.toLowerCase(), path.join(fontsDir, file));
      }
    }
    if (fontMap.size === 0) {
      console.warn(`No .ttf fonts found in ${fontsDir}.`);
    }
    console.log('Initialized fonts:', Array.from(fontMap.keys()));
  } catch (error: any) {
    console.error(`Error initializing fonts: Could not read directory ${fontsDir}.`, error.message);
  }
  return fontMap;
}

const fontMapPromise = initializeFonts();

const AnimationSegmentSchemaWithFont = z.object({
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  fontFamily: z.string().optional(),
});

const RequestBodySchema = z.object({
  mediaUrl: z.string().url(),
  segments: z.array(AnimationSegmentSchemaWithFont),
});

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
    const fontMap = await fontMapPromise;

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

    const defaultFontPath =
      fontMap.get('roboto-bold') || (fontMap.size > 0 ? Array.from(fontMap.values())[0] : undefined);
    if (!defaultFontPath) {
      throw new Error(
        'No fonts were successfully initialized. Check the `public/fonts` directory and ensure it contains .ttf files.'
      );
    }

    const response = await fetch(mediaUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch media from URL: ${mediaUrl}`);
    }
    const inputStream = Readable.fromWeb(response.body as any);

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
      '-i',
      'pipe:0',
      '-vf',
      drawtextFilters,
      '-c:a',
      'copy',
      '-movflags',
      'frag_keyframe+empty_moov',
      '-f',
      'mp4',
      'pipe:1',
    ];

    const spawnOptions = {
      env: {
        ...process.env,
        FONTCONFIG_FILE: fontConfigPath,
      },
    };

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, spawnOptions);
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
