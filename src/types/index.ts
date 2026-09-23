export interface DetectedItem {
  item_id: string;
  name: string;
  est_grams: number;
  confidence: number;
}

export interface AnalysisResult {
  analysis_id: string;
  items: DetectedItem[];
  detected_at: string;
}

export interface StoredAnalysis {
  userId: string;
  image: {
    buffer: Buffer;
    mimeType: string;
    size: number;
  };
  result: AnalysisResult;
}

export type ItemSource = 'vision' | 'manual';

export interface MealItem {
  name: string;
  grams: number;
  source: ItemSource;
  original_estimate: number | null;
  confidence: number | null;
}

export interface Meal {
  meal_id: string;
  user_id: string;
  analysis_id: string | null;
  items: MealItem[];
  total_grams: number;
  created_at: string;
}
