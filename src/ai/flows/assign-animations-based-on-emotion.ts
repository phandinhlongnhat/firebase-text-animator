'use server';
/**
 * @fileOverview A flow that analyzes text and assigns animations based on the detected emotion.
 *
 * - assignAnimationsBasedOnEmotion - A function that takes text as input, analyzes the emotion of each segment,
 *   and returns a JSON configuration with suggested animations.
 * - AssignAnimationsBasedOnEmotionInput - The input type for the assignAnimationsBasedOnEmotion function.
 * - AssignAnimationsBasedOnEmotionOutput - The return type for the assignAnimationsBasedOnEmotion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnimationOptionSchema = z.enum([
  'fadeIn',
  'rainText',
  'bounceLetters',
  'flash',
  'slide',
  'zoom-in',
  'shake',
  'glow-text',
  'karaoke-fill',
  'blur-in',
]);

const AnalyzedTextSegmentSchema = z.object({
  text: z.string().describe('The text segment to animate.'),
  emotion: z.string().describe('The emotion detected in the text segment.'),
  animations: z
    .array(AnimationOptionSchema)
    .describe('Suggested animations for the text segment based on the emotion.'),
});

export type AnalyzedTextSegment = z.infer<typeof AnalyzedTextSegmentSchema>;

const AssignAnimationsBasedOnEmotionInputSchema = z.object({
  text: z.string().describe('The input text to analyze and animate.'),
});
export type AssignAnimationsBasedOnEmotionInput = z.infer<
  typeof AssignAnimationsBasedOnEmotionInputSchema
>;

const AssignAnimationsBasedOnEmotionOutputSchema = z.array(
  AnalyzedTextSegmentSchema
);
export type AssignAnimationsBasedOnEmotionOutput = z.infer<
  typeof AssignAnimationsBasedOnEmotionOutputSchema
>;

export async function assignAnimationsBasedOnEmotion(
  input: AssignAnimationsBasedOnEmotionInput
): Promise<AssignAnimationsBasedOnEmotionOutput> {
  return assignAnimationsBasedOnEmotionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'assignAnimationsBasedOnEmotionPrompt',
  input: {schema: AssignAnimationsBasedOnEmotionInputSchema},
  output: {schema: AssignAnimationsBasedOnEmotionOutputSchema},
  prompt: `You are an AI text animation expert. You will receive text as input. For each sentence, detect the emotion of the sentence, and pick which animations would suit it best, based on the emotion.

Available animations:
- fadeIn: Simple and clean fade in. Good for neutral or calm text.
- rainText: Letters fall from the top like rain. Good for sad or melancholic text.
- bounceLetters: Each letter bounces into place. Energetic and playful.
- flash: A quick flash effect. Good for exclamations or sudden events.
- slide: Text slides in from the side. Smooth and modern.
- zoom-in: Text zooms in from a smaller size. Emphasizes the text.
- shake: The text shakes. Good for expressing anger, fear, or excitement.
- glow-text: Adds a soft glow around the text. Good for magical, dreamy, or important text.
- karaoke-fill: A color fills the text from left to right as if being spoken or sung. Great for highlighting spoken words or for a dynamic, engaging effect.
- blur-in: Text comes into focus from a blurred state. Good for memories or reveals.

Return a JSON array that contains the text, the detected emotion, and an array of suggested animations.

Text: {{{text}}}`,
});

const assignAnimationsBasedOnEmotionFlow = ai.defineFlow(
  {
    name: 'assignAnimationsBasedOnEmotionFlow',
    inputSchema: AssignAnimationsBasedOnEmotionInputSchema,
    outputSchema: AssignAnimationsBasedOnEmotionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
