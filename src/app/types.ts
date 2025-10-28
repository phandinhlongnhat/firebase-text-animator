import { z } from 'zod';

export const AnimationSegmentSchema = z.object({
  text: z.string(),
  emotion: z.string(),
  animations: z.array(z.string()),
  startTime: z.number(),
  endTime: z.number(),
});

export type AnimationSegment = z.infer<typeof AnimationSegmentSchema>;
