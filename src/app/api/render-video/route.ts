'use server';

import { NextRequest, NextResponse } from 'next/server';
import ffmpeg from 'fluent-ffmpeg';
import { Readable, PassThrough } from 'stream';
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
  // Segments are not used in this diagnostic version
  // segments: z.array(z.any()), 
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
    const { mediaUrl } = validation.data;

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

    // DIAGNOSTIC STEP: Use a simple, self-contained filter (hue=s=0 for black & white)
    // This removes the font file dependency to isolate the problem.
    const videoFilters = [{
      filter: 'hue',
      options: { s: 0 },
    }];

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
