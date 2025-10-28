'use server';

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
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

    // FINAL SOLUTION (Re-instated): The root cause was identified as a fontconfig initialization error on Windows.
    // By providing a minimal, valid fonts.conf file and pointing the FONTCONFIG_FILE environment variable to it,
    // we allow ffmpeg's font handling system to initialize correctly. With that fixed, it can now access the font file specified by its path.
    if (process.platform === 'win32') {
        const fontConfigPath = path.join(process.cwd(), 'src', 'app', 'api', 'render-video', 'fonts.conf');
        process.env.FONTCONFIG_FILE = fontConfigPath;
    }

    const response = await fetch(mediaUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch media from URL: ${mediaUrl}`);
    }
    const inputStream = Readable.fromWeb(response.body as any);

    const fontPath = path.join(process.cwd(), 'fonts', 'Roboto-Bold.ttf');

    const videoFilters = segments.map((segment) => ({
      filter: 'drawtext',
      options: {
        fontfile: fontPath,
        text: segment.text,
        fontcolor: 'white',
        fontsize: 48,
        box: 1,
        boxcolor: 'black@0.5',
        boxborderw: 10,
        x: '(w-text_w)/2',
        y: '(h-text_h)/2',
        enable: `between(t,${segment.startTime},${segment.endTime})`,
      },
    }));

    const passthrough = new PassThrough();

    const ffmpegProcess = ffmpeg(inputStream)
      .videoFilters(videoFilters)
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
