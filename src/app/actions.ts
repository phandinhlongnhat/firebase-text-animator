'use server';

import {
  assignAnimationsBasedOnEmotion,
  type AnalyzedTextSegment,
} from '@/ai/flows/assign-animations-based-on-emotion';
import { speechToTextWithTimestamps } from '@/ai/flows/speech-to-text-with-timestamps';
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
        emotion: 'neutral',
        animations: ['fadeIn'],
      });
    }
  }

  return segments;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000)
    .toString()
    .padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

export async function generateSrtFromMediaAction(
  mediaDataUri: string
): Promise<{
  data: string | null;
  error: string | null;
}> {
  try {
    const rawResult = await speechToTextWithTimestamps({ mediaDataUri });
    let srtContent = '';
    rawResult.forEach((segment, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${formatTimestamp(
        segment.startTime
      )} --> ${formatTimestamp(segment.endTime)}\n`;
      srtContent += `${segment.text}\n\n`;
    });

    if (!srtContent.trim()) {
      return { data: '', error: 'No speech detected in the media file.' };
    }

    return { data: srtContent, error: null };
  } catch (e) {
    console.error(e);
    return {
      data: null,
      error: 'Failed to generate timings from media. Please try again.',
    };
  }
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
    
    const combinedText = srtSegments.map(s => s.text).join('\n');
    const emotionResult: AnalyzedTextSegment[] = await assignAnimationsBasedOnEmotion({ text: combinedText });

    const finalSegments = srtSegments.map(segment => {
      const matchedEmotion = emotionResult.find(res => res.text.includes(segment.text) || segment.text.includes(res.text));
      if (matchedEmotion) {
        return {
          ...segment,
          emotion: matchedEmotion.emotion,
          animations: matchedEmotion.animations as string[],
        }
      }
      return segment;
    });


    return { data: finalSegments, error: null };
  } catch (e) {
    console.error(e);
    return {
      data: null,
      error: 'Failed to process SRT data. Please try again.',
    };
  }
}
