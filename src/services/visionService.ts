import {
  FunctionCallingMode,
  FunctionDeclaration,
  GoogleGenerativeAI,
  SchemaType,
} from '@google/generative-ai';
import { z } from 'zod';
import { config } from '../config';

export interface RawDetection {
  name: string;
  est_grams: number;
  confidence: number;
}

const REPORT_FN = 'report_food_items';

const reportFoodItems: FunctionDeclaration = {
  name: REPORT_FN,
  description: 'Report every distinct food item visible in the meal photo with an estimated edible weight.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      items: {
        type: SchemaType.ARRAY,
        description: 'Detected food items. Empty if no food is visible.',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: 'Common food name, e.g. "white rice"' },
            est_grams: { type: SchemaType.NUMBER, description: 'Estimated weight of the portion in grams' },
            confidence: { type: SchemaType.NUMBER, description: 'Confidence from 0 to 1' },
          },
          required: ['name', 'est_grams', 'confidence'],
        },
      },
    },
    required: ['items'],
  },
};

const PROMPT =
  'Identify each distinct food item in this meal photo and estimate the weight in grams of the portion shown. ' +
  'Use visual cues (plate size, utensils) for scale. Give a confidence between 0 and 1 for each item. ' +
  `Always respond by calling ${REPORT_FN}; pass an empty items array if no food is visible.`;

// Model output is untrusted: validate shape, drop unusable rows, clamp confidence.
const detectionSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().trim().min(1),
      est_grams: z.number().finite(),
      confidence: z.number().finite(),
    }),
  ),
});

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!config.geminiApiKey) return null;
  client ??= new GoogleGenerativeAI(config.geminiApiKey);
  return client;
}

/**
 * Detects food items in an image. Never throws: any failure (missing key, API error,
 * malformed output) yields an empty array so callers can fall back to manual entry.
 */
export async function detectFoodItems(image: Buffer, mimeType: string): Promise<RawDetection[]> {
  const genAI = getClient();
  if (!genAI) {
    console.warn('GEMINI_API_KEY not set; skipping food detection');
    return [];
  }

  try {
    const model = genAI.getGenerativeModel(
      {
        model: config.geminiModel,
        tools: [{ functionDeclarations: [reportFoodItems] }],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: [REPORT_FN] },
        },
        generationConfig: { temperature: 0.2 },
      },
      { timeout: config.geminiTimeoutMs },
    );

    const result = await model.generateContent([
      { text: PROMPT },
      { inlineData: { data: image.toString('base64'), mimeType } },
    ]);

    const call = result.response.functionCalls()?.find((c) => c.name === REPORT_FN);
    if (!call) return [];

    const parsed = detectionSchema.safeParse(call.args);
    if (!parsed.success) {
      console.warn('Gemini returned malformed detection payload', parsed.error.issues);
      return [];
    }

    return parsed.data.items
      .filter((item) => item.est_grams > 0)
      .map((item) => ({
        name: item.name,
        est_grams: Math.round(item.est_grams),
        confidence: Math.min(1, Math.max(0, item.confidence)),
      }));
  } catch (err) {
    console.error('Gemini food detection failed', err);
    return [];
  }
}
