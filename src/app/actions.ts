'use server';

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

function parseSrt(srtContent: string): AnimationSegment[] {
  const segments: AnimationSegment[] = [];
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
        emotion: 'neutral', // Default emotion
        animations: ['fadeIn'], // Default animation
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
    
    // Just return the parsed segments directly, without AI enrichment.
    return { data: srtSegments, error: null };
  } catch (e) {
    console.error(e);
    return {
      data: null,
      error: 'Failed to process SRT data. Please try again.',
    };
  }
}
