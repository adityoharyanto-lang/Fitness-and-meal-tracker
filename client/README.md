# Meal Tracker — Web Client

React + Vite + TypeScript client for the meal-photo capture → confirm → log flow.

## Run

```bash
npm install && npm run dev
```

Then open http://localhost:5173.

**Requires the backend running on port 3000** (`http://localhost:3000`). The Vite dev server proxies `/v1/*` requests to it (see `vite.config.ts`), so no CORS setup is needed on the backend. All requests send `x-user-id: demo-user`.

## Build

```bash
npm run build
```

Output goes to `dist/`. Note that the `/v1` proxy only exists in `npm run dev` / `npm run preview`; if you serve `dist/` some other way, route `/v1` to the backend yourself.

## Flow

1. **Capture** — pick or take a photo.
2. **Loading** — `POST /v1/meals/analyze` (multipart, field `image`). The label changes to "Still working..." after 10s.
3. **Confirm** — adjust detected items (±10g stepper, tap grams to type a value), add manual items, then `POST /v1/meals`.
   - No items detected → empty message plus manual entry.
   - Analyze request failed → dismissible banner plus manual entry (`analysis_id: null`).
4. **Success** — shows the total logged, then returns to Capture after ~1.5s.
