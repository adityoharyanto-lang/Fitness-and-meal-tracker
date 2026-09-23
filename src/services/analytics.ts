export type AnalyticsEventName =
  | 'meal_photo_captured'
  | 'meal_items_detected'
  | 'meal_item_grams_edited'
  | 'meal_confirmed';

/** Emits a structured analytics event to stdout. Replace with a real sink (Segment, etc.). */
export function track(event: AnalyticsEventName, userId: string, properties: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      type: 'analytics',
      event,
      user_id: userId,
      timestamp: new Date().toISOString(),
      properties,
    }),
  );
}
