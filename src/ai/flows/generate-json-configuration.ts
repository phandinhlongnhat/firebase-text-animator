'use server';

/**
 * @fileOverview Generates a JSON configuration file containing text, emotion, and animation type.
 *
 * - generateJsonConfiguration - A function that handles the generation of the JSON configuration.
 * - GenerateJsonConfigurationInput - The input type for the generateJsonConfiguration function.
 * - GenerateJsonConfigurationOutput - The return type for the generateJsonConfiguration function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateJsonConfigurationInputSchema = z.object({
  text: z.string().describe('The text content.'),
  emotion: z.string().describe('The analyzed emotion of the text.'),
  animations: z.array(z.string()).describe('The assigned animation types for the text.'),
});
export type GenerateJsonConfigurationInput = z.infer<typeof GenerateJsonConfigurationInputSchema>;

const GenerateJsonConfigurationOutputSchema = z.string().describe('The JSON configuration string.');
export type GenerateJsonConfigurationOutput = z.infer<typeof GenerateJsonConfigurationOutputSchema>;

export async function generateJsonConfiguration(
  input: GenerateJsonConfigurationInput
): Promise<GenerateJsonConfigurationOutput> {
  return generateJsonConfigurationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateJsonConfigurationPrompt',
  input: {schema: GenerateJsonConfigurationInputSchema},
  output: {schema: GenerateJsonConfigurationOutputSchema},
  prompt: `You are a configuration expert who converts data into JSON format.

  Given the following text, emotion, and animations, create a JSON configuration string:

  Text: {{{text}}}
  Emotion: {{{emotion}}}
  Animations: {{{animations}}}

  Ensure the JSON format is valid and contains the text, emotion, and animations.
  `,
});

const generateJsonConfigurationFlow = ai.defineFlow(
  {
    name: 'generateJsonConfigurationFlow',
    inputSchema: GenerateJsonConfigurationInputSchema,
    outputSchema: GenerateJsonConfigurationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
