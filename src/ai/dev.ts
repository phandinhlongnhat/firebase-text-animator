'use server';

import { config } from 'dotenv';
config();

import '@/ai/flows/analyze-text-input-for-emotion.ts';
import '@/ai/flows/assign-animations-based-on-emotion.ts';
import '@/ai/flows/generate-json-configuration.ts';
import '@/ai/flows/speech-to-text.ts';
import '@/ai/flows/speech-to-text-with-timestamps.ts';
