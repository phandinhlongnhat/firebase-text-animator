'use server';

/**
 * @fileOverview Transcribes audio or video data to text with timestamps.
 *
 * - speechToTextWithTimestamps - A function that handles the speech-to-text process.
 * - SpeechToTextWithTimestampsInput - The input type for the speechToTextWithTimestamps function.
 * - SpeechToTextWithTimestampsOutput - The return type for the speechToTextWithTimestamps function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SpeechToTextWithTimestampsInputSchema = z.object({
  mediaDataUri: z
    .string()
    .describe(
      "A video or audio file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SpeechToTextWithTimestampsInput = z.infer<
  typeof SpeechToTextWithTimestampsInputSchema
>;

const SpeechToTextWithTimestampsOutputSchema = z.array(
  z.object({
    text: z.string().describe('The transcribed text segment.'),
    startTime: z.number().describe('The start time of the segment in seconds.'),
    endTime: z.number().describe('The end time of the segment in seconds.'),
  })
);
export type SpeechToTextWithTimestampsOutput = z.infer<
  typeof SpeechToTextWithTimestampsOutputSchema
>;

export async function speechToTextWithTimestamps(
  input: SpeechToTextWithTimestampsInput
): Promise<SpeechToTextWithTimestampsOutput> {
  return speechToTextWithTimestampsFlow(input);
}

const speechToTextWithTimestampsFlow = ai.defineFlow(
  {
    name: 'speechToTextWithTimestampsFlow',
    inputSchema: SpeechToTextWithTimestampsInputSchema,
    outputSchema: SpeechToTextWithTimestampsOutputSchema,
  },
  async (input) => {
    const { output } = await ai.generate({
      model: 'googleai/gemini-1.5-pro',
      prompt: `You are a highly accurate speech-to-text transcription service. Transcribe the audio from the following file and provide timestamps for each segment.

IMPORTANT: Group transcribed words into natural segments based on pauses and sentence structure. Each segment should be a meaningful phrase or clause, roughly 1-2 lines of text in length (around 8-15 words). Avoid creating very short, choppy segments.

  {{media url=mediaDataUri}}
  
  Return a JSON array where each object contains the transcribed text segment, its start time, and its end time in seconds.
  Example format:
  [
    {
      "text": "This is the first sentence, and it's a bit longer.",
      "startTime": 0.5,
      "endTime": 3.7
    },
    {
      "text": "Here is the second part of the speech.",
      "startTime": 4.1,
      "endTime": 6.0
    }
  ]
  `,
      promptParams: { mediaDataUri: input.mediaDataUri },
      output: {
        format: 'json',
        schema: SpeechToTextWithTimestampsOutputSchema,
      },
    });
    return output!;
  }
);
