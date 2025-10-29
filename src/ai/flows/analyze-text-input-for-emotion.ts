'use server';
/**
 * @fileOverview Analyzes text input to determine the emotion conveyed by each sentence or phrase.
 *
 * - analyzeTextInputForEmotion - A function that analyzes text input and returns the emotion of each segment.
 * - AnalyzeTextInputForEmotionInput - The input type for the analyzeTextInputForEmotion function.
 * - AnalyzeTextInputForEmotionOutput - The return type for the analyzeTextInputForEmotion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeTextInputForEmotionInputSchema = z.object({
  text: z.string().describe('The text to analyze for emotion.'),
});
export type AnalyzeTextInputForEmotionInput = z.infer<typeof AnalyzeTextInputForEmotionInputSchema>;

const AnalyzeTextInputForEmotionOutputSchema = z.array(
  z.object({
    text: z.string().describe('The original text segment.'),
    emotion: z.string().describe('The detected emotion of the text segment.'),
    animations: z.array(z.string()).describe('Suggested animations for the text segment based on the emotion.'),
  })
);
export type AnalyzeTextInputForEmotionOutput = z.infer<typeof AnalyzeTextInputForEmotionOutputSchema>;

export async function analyzeTextInputForEmotion(input: AnalyzeTextInputForEmotionInput): Promise<AnalyzeTextInputForEmotionOutput> {
  return analyzeTextInputForEmotionFlow(input);
}

const analyzeTextInputForEmotionFlow = ai.defineFlow(
  {
    name: 'analyzeTextInputForEmotionFlow',
    inputSchema: AnalyzeTextInputForEmotionInputSchema,
    outputSchema: AnalyzeTextInputForEmotionOutputSchema,
  },
  async input => {
    const {output} = await ai.generate({
      prompt: `You are an AI that analyzes the emotion of text segments and suggests suitable animations.

Analyze the following text and determine the emotion conveyed by each sentence or phrase. Suggest animations that would be appropriate for each segment based on its emotion.

Text: ${input.text}

Respond with a JSON array, where each object contains the original text segment, the detected emotion, and an array of suggested animations.  The 'emotion' field should be a single word describing the primary emotion (e.g., 'sad', 'happy', 'energetic', 'calm', 'angry').  The animations should be selected from this list: fadeIn, rainText, bounceLetters, flash, slide, zoom-in, shake, gradient-text. If no animations are suitable, return an empty array for animations.

Example output:
[
  {
    "text": "Anh nhớ em trong đêm mưa",
    "emotion": "sad",
    "animations": ["fadeIn", "rainText"]
  },
  {
    "text": "Let's go baby!",
    "emotion": "energetic",
    "animations": ["bounceLetters", "flash", "gradient-text"]
  }
]
`,
      model: 'googleai/gemini-1.5-flash',
      output: {
        schema: AnalyzeTextInputForEmotionOutputSchema
      }
    });
    return output!;
  }
);
