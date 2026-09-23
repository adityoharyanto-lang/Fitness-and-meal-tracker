import { z } from 'zod';

export const mealItemSchema = z.object({
  name: z.string().trim().min(1),
  grams: z.number().finite().positive(),
  source: z.enum(['vision', 'manual']),
  original_estimate: z.number().finite().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const createMealSchema = z.object({
  analysis_id: z.string().min(1).nullable(),
  items: z.array(mealItemSchema).nonempty(),
});

export type CreateMealInput = z.infer<typeof createMealSchema>;
