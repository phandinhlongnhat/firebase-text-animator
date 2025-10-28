'use server';

/**
 * @fileOverview Transcribes audio or video data to text.
 *
 * - speechToText - A function that handles the speech-to-text process.
 * - SpeechToTextInput - The input type for the speechToText function.
 * - SpeechToTextOutput - The return type for the speechToText function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SpeechToTextInputSchema = z.object({
  mediaDataUri: z
    .string()
    .describe(
      "A video or audio file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type SpeechToTextInput = z.infer<typeof SpeechToTextInputSchema>;

const SpeechToTextOutputSchema = z.object({
  text: z.string().describe('The transcribed text from the media file.'),
});
export type SpeechToTextOutput = z.infer<typeof SpeechToTextOutputSchema>;

export async function speechToText(
  input: SpeechToTextInput
): Promise<SpeechToTextOutput> {
  return speechToTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'speechToTextPrompt',
  input: { schema: SpeechToTextInputSchema },
  output: { schema: SpeechToTextOutputSchema },
  prompt: `You are a highly accurate speech-to-text transcription service. Transcribe the audio from the following file.

  {{media url=mediaDataUri}}
  
  Return only the transcribed text.`,
});

const speechToTextFlow = ai.defineFlow(
  {
    name: 'speechToTextFlow',
    inputSchema: SpeechToTextInputSchema,
    outputSchema: SpeechToTextOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
