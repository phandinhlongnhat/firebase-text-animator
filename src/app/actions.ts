'use server';

import { analyzeTextInputForEmotion } from '@/ai/flows/analyze-text-input-for-emotion';
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

function parseSrt(srtContent: string): Omit<AnimationSegment, 'emotion' | 'animations'>[] {
  const segments: Omit<AnimationSegment, 'emotion' | 'animations'>[] = [];
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
    
    const fullText = srtSegments.map(s => s.text).join('\n');
    const analysis = await analyzeTextInputForEmotion({ text: fullText });

    // A simple mapping strategy: find the original segment by exact text match
    const enrichedSegments = srtSegments.map(srtSeg => {
      const analyzedSeg = analysis.find(a => a.text.includes(srtSeg.text));
      return {
        ...srtSeg,
        emotion: analyzedSeg?.emotion || 'neutral',
        animations: analyzedSeg?.animations || ['fadeIn'],
      };
    });

    return { data: enrichedSegments, error: null };
  } catch (e: any) {
    console.error(e);
    const errorMessage = e.message || "An unknown error occurred with the AI model.";
    return {
      data: null,
      error: `Failed to analyze text with AI. ${errorMessage}`,
    };
  }
}
