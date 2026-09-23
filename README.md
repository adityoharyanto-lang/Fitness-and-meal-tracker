# Fitness-and-meal-tracker
fitness and meal tracker

## Backend service

Node.js + TypeScript + Express API for turning a meal photo into editable gram estimates, then confirming the meal.

### Setup

```bash
npm install
cp .env.example .env   # then set GEMINI_API_KEY
npm run dev            # ts-node-dev with auto-reload, http://localhost:3000
# or
npm run build && npm start
```

| Variable         | Required | Default            | Notes                                      |
| ---------------- | -------- | ------------------ | ------------------------------------------ |
| `GEMINI_API_KEY` | yes      | —                  | Without it, `/analyze` returns `items: []` |
| `GEMINI_MODEL`   | no       | `gemini-2.0-flash` |                                            |
| `PORT`           | no       | `3000`             |                                            |

### Project layout

```
src/
  index.ts              entrypoint (loads .env, starts server)
  app.ts                express app wiring
  config.ts             env + limits
  middleware/           auth stub, rate limiter, multer upload, error handler
  routes/               analyze.ts, meals.ts
  schemas/              zod request schemas
  services/             Gemini vision, analysis TTL store, meal store (stub), analytics
  types/                shared types
```

### Authentication

Both endpoints require an `x-user-id` header (auth stub). Missing header → `401`.

```json
{ "error": "unauthorized", "message": "Missing x-user-id header" }
```

---

### `POST /v1/meals/analyze`

Upload a meal photo and get detected food items with estimated grams.

- `multipart/form-data`, field name **`image`**
- `image/jpeg` or `image/png`, max **8MB**
- Rate limited to **20 requests/minute per user** (keyed on `x-user-id`) → `429` when exceeded
- Detection failures or no food found still return **`200` with `items: []`**; the client should fall back to manual entry
- The image and result are held in memory for **1 hour** under `analysis_id`

```bash
curl -X POST http://localhost:3000/v1/meals/analyze \
  -H "x-user-id: user_123" \
  -F "image=@./lunch.jpg;type=image/jpeg"
```

`200 OK`

```json
{
  "analysis_id": "3f1c2a8e-6b9d-4f0e-9a51-2d7c8e4b1a90",
  "items": [
    { "item_id": "b7e2...", "name": "white rice", "est_grams": 180, "confidence": 0.86 },
    { "item_id": "c19a...", "name": "grilled chicken breast", "est_grams": 120, "confidence": 0.74 },
    { "item_id": "d4f0...", "name": "steamed broccoli", "est_grams": 60, "confidence": 0.41 }
  ],
  "detected_at": "2026-09-23T04:12:33.518Z"
}
```

Empty / failed detection, still `200 OK`:

```json
{ "analysis_id": "9a0e...", "items": [], "detected_at": "2026-09-23T04:12:33.518Z" }
```

Upload errors (these are about the file itself, not detection):

| Status | `error`                  | Cause                         |
| ------ | ------------------------ | ----------------------------- |
| 400    | `missing_image`          | No `image` field              |
| 413    | `file_too_large`         | Image over 8MB                |
| 415    | `unsupported_media_type` | Not JPEG or PNG               |
| 429    | `rate_limited`           | More than 20 requests/minute  |

---

### `POST /v1/meals`

Confirm a meal: the user's final list of items, whether they came from vision (possibly edited) or were added manually.

Body:

| Field                       | Type                      | Rules                                   |
| --------------------------- | ------------------------- | --------------------------------------- |
| `analysis_id`               | `string \| null`          | From `/analyze`, or `null` if no photo  |
| `items`                     | array                     | Must be non-empty                       |
| `items[].name`              | `string`                  | Non-empty                               |
| `items[].grams`             | `number`                  | Must be `> 0`                           |
| `items[].source`            | `"vision" \| "manual"`    |                                         |
| `items[].original_estimate` | `number \| null`          | The model's `est_grams`; `null` if manual |
| `items[].confidence`        | `number \| null`          | 0–1; `null` if manual                   |

```bash
curl -X POST http://localhost:3000/v1/meals \
  -H "x-user-id: user_123" \
  -H "Content-Type: application/json" \
  -d '{
    "analysis_id": "3f1c2a8e-6b9d-4f0e-9a51-2d7c8e4b1a90",
    "items": [
      { "name": "white rice", "grams": 150, "source": "vision", "original_estimate": 180, "confidence": 0.86 },
      { "name": "grilled chicken breast", "grams": 120, "source": "vision", "original_estimate": 120, "confidence": 0.74 },
      { "name": "soy sauce", "grams": 15, "source": "manual", "original_estimate": null, "confidence": null }
    ]
  }'
```

`201 Created`

```json
{
  "meal_id": "e5a1c0d2-8f3b-4a6e-b1d9-7c2f0e9a4b35",
  "user_id": "user_123",
  "analysis_id": "3f1c2a8e-6b9d-4f0e-9a51-2d7c8e4b1a90",
  "items": [
    { "name": "white rice", "grams": 150, "source": "vision", "original_estimate": 180, "confidence": 0.86 },
    { "name": "grilled chicken breast", "grams": 120, "source": "vision", "original_estimate": 120, "confidence": 0.74 },
    { "name": "soy sauce", "grams": 15, "source": "manual", "original_estimate": null, "confidence": null }
  ],
  "total_grams": 285,
  "created_at": "2026-09-23T04:13:02.104Z"
}
```

Validation failure → `400 Bad Request`:

```json
{
  "error": "validation_error",
  "issues": [{ "path": "items.0.grams", "message": "Number must be greater than 0" }]
}
```

#### Analytics events

On a successful confirm, structured JSON events are logged to stdout (one line each):

| Event                    | When                                              | Properties                                                        |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------------------- |
| `meal_photo_captured`    | `analysis_id` is non-null                         | `analysis_id`, `image_bytes`, `mime_type`                         |
| `meal_items_detected`    | `analysis_id` is non-null                         | `item_count`, `avg_confidence`, `low_confidence_count` (< 0.5)    |
| `meal_item_grams_edited` | Once per item where `grams != original_estimate`  | `item_name`, `original_estimate`, `edited_value`, `delta`         |
| `meal_confirmed`         | Always                                            | `total_items`, `manual_item_count`, `total_grams`                 |

`meal_items_detected` uses the stored analysis result when it's still in memory (under 1 hour old, same user), and otherwise falls back to the `vision` items in the request.

```json
{"type":"analytics","event":"meal_item_grams_edited","user_id":"user_123","timestamp":"2026-09-23T04:13:02.105Z","properties":{"meal_id":"e5a1...","item_name":"white rice","original_estimate":180,"edited_value":150,"delta":-30}}
```

### Stubs to replace before production

- **Auth**: `src/middleware/auth.ts` trusts `x-user-id` as-is.
- **Persistence**: `src/services/mealStore.ts` keeps meals in an in-memory array (marked where the DB insert goes).
- **Analysis store / rate limiter**: in-memory, per process; use Redis (or similar) when running more than one instance.
