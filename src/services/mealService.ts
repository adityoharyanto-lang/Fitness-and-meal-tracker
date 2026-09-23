import { v4 as uuidv4 } from 'uuid';
import { CreateMealInput } from '../schemas/meal';
import { Meal } from '../types';
import { track } from './analytics';
import { getAnalysis } from './analysisStore';
import { insertMeal } from './mealStore';

const LOW_CONFIDENCE_THRESHOLD = 0.5;

export async function confirmMeal(userId: string, input: CreateMealInput): Promise<Meal> {
  const items = input.items.map((item) => ({ ...item }));
  const totalGrams = items.reduce((sum, item) => sum + item.grams, 0);

  const meal: Meal = {
    meal_id: uuidv4(),
    user_id: userId,
    analysis_id: input.analysis_id,
    items,
    total_grams: totalGrams,
    created_at: new Date().toISOString(),
  };

  const saved = await insertMeal(meal);
  emitMealAnalytics(userId, saved);
  return saved;
}

function emitMealAnalytics(userId: string, meal: Meal): void {
  // Photo events only apply when the meal originated from an analysis.
  if (meal.analysis_id) {
    // Prefer what the model actually detected; fall back to the client's vision items
    // if the analysis has expired or belongs to another user.
    const stored = getAnalysis(meal.analysis_id);
    const analysis = stored && stored.userId === userId ? stored : undefined;
    const confidences = analysis
      ? analysis.result.items.map((i) => i.confidence)
      : meal.items.filter((i) => i.source === 'vision' && i.confidence !== null).map((i) => i.confidence as number);

    track('meal_photo_captured', userId, {
      analysis_id: meal.analysis_id,
      image_bytes: analysis?.image.size ?? null,
      mime_type: analysis?.image.mimeType ?? null,
    });

    track('meal_items_detected', userId, {
      analysis_id: meal.analysis_id,
      item_count: confidences.length,
      avg_confidence: confidences.length
        ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : null,
      low_confidence_count: confidences.filter((c) => c < LOW_CONFIDENCE_THRESHOLD).length,
    });
  }

  for (const item of meal.items) {
    if (item.original_estimate !== null && item.grams !== item.original_estimate) {
      track('meal_item_grams_edited', userId, {
        meal_id: meal.meal_id,
        item_name: item.name,
        original_estimate: item.original_estimate,
        edited_value: item.grams,
        delta: round(item.grams - item.original_estimate),
      });
    }
  }

  track('meal_confirmed', userId, {
    meal_id: meal.meal_id,
    analysis_id: meal.analysis_id,
    total_items: meal.items.length,
    manual_item_count: meal.items.filter((i) => i.source === 'manual').length,
    total_grams: meal.total_grams,
  });
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
