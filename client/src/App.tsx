import { useEffect, useRef, useState } from 'react';

// ---- API contract (mirrors src/types/index.ts and src/schemas/meal.ts on the backend) ----

const USER_ID = 'demo-user';

type ItemSource = 'vision' | 'manual';

interface DetectedItem {
  item_id: string;
  name: string;
  est_grams: number;
  confidence: number;
}

interface AnalysisResult {
  analysis_id: string;
  items: DetectedItem[];
  detected_at: string;
}

interface MealItem {
  name: string;
  grams: number;
  source: ItemSource;
  original_estimate: number | null;
  confidence: number | null;
}

interface Meal {
  meal_id: string;
  total_grams: number;
}

async function analyzeMeal(file: File, signal: AbortSignal): Promise<AnalysisResult> {
  const body = new FormData();
  body.append('image', file);
  const res = await fetch('/v1/meals/analyze', {
    method: 'POST',
    headers: { 'x-user-id': USER_ID },
    body,
    signal,
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status}`);
  return res.json();
}

async function logMeal(analysisId: string | null, items: MealItem[]): Promise<Meal> {
  const res = await fetch('/v1/meals', {
    method: 'POST',
    headers: { 'x-user-id': USER_ID, 'content-type': 'application/json' },
    body: JSON.stringify({ analysis_id: analysisId, items }),
  });
  if (!res.ok) throw new Error(`log failed: ${res.status}`);
  return res.json();
}

// ---- Local state ----

interface EditableItem extends MealItem {
  key: string;
}

type Screen =
  | { kind: 'capture' }
  | { kind: 'loading' }
  | { kind: 'confirm'; mode: 'detected' | 'empty' | 'error' }
  | { kind: 'success'; totalGrams: number };

const STEP_GRAMS = 10;
const LOW_CONFIDENCE = 0.5;
const SLOW_ANALYSIS_MS = 10_000;
const SUCCESS_DISMISS_MS = 1_500;

let keyCounter = 0;
const nextKey = () => `item-${++keyCounter}`;

function fromDetected(d: DetectedItem): EditableItem {
  return {
    key: d.item_id,
    name: d.name,
    grams: Math.round(d.est_grams),
    source: 'vision',
    original_estimate: d.est_grams,
    confidence: d.confidence,
  };
}

function blankManualItem(): EditableItem {
  return { key: nextKey(), name: '', grams: 0, source: 'manual', original_estimate: null, confidence: null };
}

// ---- App ----

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'capture' });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [slow, setSlow] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Release the object URL whenever the photo changes or the app unmounts.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Switch the loading label after 10s.
  useEffect(() => {
    if (screen.kind !== 'loading') return;
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), SLOW_ANALYSIS_MS);
    return () => window.clearTimeout(t);
  }, [screen.kind]);

  // Auto-dismiss success back to capture.
  useEffect(() => {
    if (screen.kind !== 'success') return;
    const t = window.setTimeout(reset, SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [screen.kind]);

  function reset() {
    abortRef.current?.abort();
    setPhotoUrl(null);
    setAnalysisId(null);
    setItems([]);
    setSubmitError(null);
    setBannerVisible(true);
    setScreen({ kind: 'capture' });
  }

  async function handlePhoto(file: File) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhotoUrl(URL.createObjectURL(file));
    setItems([]);
    setAnalysisId(null);
    setSubmitError(null);
    setBannerVisible(true);
    setScreen({ kind: 'loading' });

    try {
      const result = await analyzeMeal(file, controller.signal);
      if (controller.signal.aborted) return;
      setAnalysisId(result.analysis_id);
      setItems(result.items.map(fromDetected));
      setScreen({ kind: 'confirm', mode: result.items.length > 0 ? 'detected' : 'empty' });
    } catch {
      if (controller.signal.aborted) return;
      setScreen({ kind: 'confirm', mode: 'error' });
    }
  }

  function updateItem(key: string, patch: Partial<MealItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  async function handleConfirm() {
    const toLog = items.filter((it) => it.grams > 0);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const meal = await logMeal(
        analysisId,
        toLog.map(({ name, grams, source, original_estimate, confidence }) => ({
          name: name.trim(),
          grams,
          source,
          original_estimate,
          confidence,
        })),
      );
      setScreen({ kind: 'success', totalGrams: meal.total_grams });
    } catch {
      setSubmitError('Could not log this meal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      {screen.kind === 'capture' && <CaptureScreen onPhoto={handlePhoto} />}
      {screen.kind === 'loading' && <LoadingScreen photoUrl={photoUrl} slow={slow} />}
      {screen.kind === 'confirm' && (
        <ConfirmScreen
          mode={screen.mode}
          photoUrl={photoUrl}
          items={items}
          bannerVisible={bannerVisible}
          onDismissBanner={() => setBannerVisible(false)}
          onUpdate={updateItem}
          onRemove={removeItem}
          onAdd={() => setItems((prev) => [...prev, blankManualItem()])}
          onConfirm={handleConfirm}
          onCancel={reset}
          submitting={submitting}
          submitError={submitError}
        />
      )}
      {screen.kind === 'success' && <SuccessScreen totalGrams={screen.totalGrams} />}
    </div>
  );
}

// ---- Screens ----

function CaptureScreen({ onPhoto }: { onPhoto: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="screen capture">
      <div className="viewfinder">
        <div className="viewfinder-frame" />
        <p className="helper">Center your plate in the frame.</p>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPhoto(file);
        }}
      />
      <button
        type="button"
        className="shutter"
        aria-label="Take or choose a photo"
        onClick={() => inputRef.current?.click()}
      >
        <span className="shutter-inner" />
      </button>
    </div>
  );
}

function LoadingScreen({ photoUrl, slow }: { photoUrl: string | null; slow: boolean }) {
  return (
    <div className="screen loading">
      <div className="loading-photo">
        {photoUrl && <img src={photoUrl} alt="Captured meal" />}
        <div className="loading-overlay">
          <div className="spinner" aria-hidden="true" />
          <p className="loading-label" role="status">
            {slow ? 'Still working...' : 'Analyzing your meal...'}
          </p>
        </div>
      </div>
      <ul className="skeleton-list" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="skeleton-row">
            <span className="shimmer shimmer-name" />
            <span className="shimmer shimmer-grams" />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ConfirmScreenProps {
  mode: 'detected' | 'empty' | 'error';
  photoUrl: string | null;
  items: EditableItem[];
  bannerVisible: boolean;
  onDismissBanner: () => void;
  onUpdate: (key: string, patch: Partial<MealItem>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitError: string | null;
}

function ConfirmScreen(props: ConfirmScreenProps) {
  const { mode, photoUrl, items, submitting, submitError } = props;
  const [expanded, setExpanded] = useState(false);

  const positive = items.filter((it) => it.grams > 0);
  const missingName = positive.some((it) => it.name.trim() === '');
  const canConfirm = positive.length > 0 && !missingName && !submitting;

  return (
    <div className="screen confirm">
      <header className="photo-header">
        {photoUrl && (
          <button
            type="button"
            className={`thumb ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse photo' : 'Expand photo'}
          >
            <img src={photoUrl} alt="Your meal" />
          </button>
        )}
        <div className="photo-header-text">
          <h1>Confirm your meal</h1>
          <button type="button" className="link" onClick={props.onCancel}>
            Retake
          </button>
        </div>
      </header>

      <main className="confirm-body">
        {mode === 'error' && props.bannerVisible && (
          <div className="banner" role="alert">
            <span>Could not auto-detect - enter items manually.</span>
            <button type="button" className="banner-close" aria-label="Dismiss" onClick={props.onDismissBanner}>
              ×
            </button>
          </div>
        )}
        {mode === 'empty' && <p className="empty">We could not identify anything in this photo.</p>}

        <ul className="item-list">
          {items.map((item) => (
            <FoodItemRow
              key={item.key}
              item={item}
              onChange={(patch) => props.onUpdate(item.key, patch)}
              onRemove={() => props.onRemove(item.key)}
            />
          ))}
          <li>
            <button type="button" className="add-row" onClick={props.onAdd}>
              + Add food item
            </button>
          </li>
        </ul>
      </main>

      <footer className="sticky-footer">
        {submitError && <p className="footer-error">{submitError}</p>}
        {!submitError && missingName && <p className="footer-hint">Name every item with grams before logging.</p>}
        <button type="button" className="primary" disabled={!canConfirm} onClick={props.onConfirm}>
          {submitting ? 'Logging...' : 'Confirm & Log'}
        </button>
      </footer>
    </div>
  );
}

function SuccessScreen({ totalGrams }: { totalGrams: number }) {
  return (
    <div className="screen success" role="status">
      <svg className="check-icon" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" />
        <path d="M15 27 l7 7 l15 -16" />
      </svg>
      <p className="success-label">Logged {Math.round(totalGrams)}g total</p>
    </div>
  );
}

// ---- Food category icon inference (client-side, name-based) ----

type FoodCategory = 'produce' | 'protein' | 'grain' | 'dairy' | 'sauce_condiment' | 'fruit' | 'beverage' | 'other';

const CATEGORY_ICONS: Record<FoodCategory, string> = {
  produce: '🥦',
  protein: '🍗',
  grain: '🍚',
  dairy: '🧀',
  sauce_condiment: '🥣',
  fruit: '🍎',
  beverage: '🥤',
  other: '🍽️',
};

const CATEGORY_KEYWORDS: Array<[FoodCategory, RegExp]> = [
  ['beverage', /\b(juice|soda|cola|water|coffee|tea|latte|smoothie|milkshake|beer|wine|drink)\b/i],
  ['dairy', /\b(cheese|milk|yogurt|yoghurt|butter|cream|mozzarella|cheddar|parmesan)\b/i],
  ['sauce_condiment', /\b(sauce|dressing|dip|ketchup|mayo|mayonnaise|mustard|gravy|salsa|vinaigrette|syrup)\b/i],
  ['fruit', /\b(apple|banana|orange|grape|berry|berries|mango|pineapple|melon|watermelon|peach|pear|kiwi|cherry|cherries|fruit)\b/i],
  ['grain', /\b(rice|bread|pasta|noodle|noodles|toast|bun|bagel|cereal|oat|oats|quinoa|tortilla|potato|potatoes|fries)\b/i],
  ['protein', /\b(chicken|beef|pork|fish|salmon|tuna|shrimp|egg|eggs|tofu|steak|bacon|sausage|turkey|lamb|meat|patty)\b/i],
  ['produce', /\b(salad|broccoli|spinach|lettuce|carrot|cucumber|tomato|pepper|onion|kale|vegetable|veggies|greens|zucchini|cabbage)\b/i],
];

function categorizeFood(name: string): FoodCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(name)) return category;
  }
  return 'other';
}

// ---- FoodItemRow (shared across detected / empty / error states) ----

interface FoodItemRowProps {
  item: EditableItem;
  onChange: (patch: Partial<MealItem>) => void;
  onRemove: () => void;
}

function FoodItemRow({ item, onChange, onRemove }: FoodItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const lowConfidence = item.confidence !== null && item.confidence < LOW_CONFIDENCE;
  const edited = item.original_estimate !== null && item.grams !== Math.round(item.original_estimate);

  const setGrams = (g: number) => onChange({ grams: Math.max(0, Math.round(g)) });

  function commitDraft() {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) setGrams(n);
    setEditing(false);
  }

  const icon = CATEGORY_ICONS[categorizeFood(item.name)];

  return (
    <li className="food-row">
      <span className="food-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="food-row-main">
        <input
          className="food-name"
          value={item.name}
          placeholder="Food name"
          aria-label="Food name"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="food-meta">
          {lowConfidence && <span className="badge-low">Low confidence</span>}
          {edited && (
            <span className="edited-tick" title="Edited">
              ✓ edited
            </span>
          )}
        </div>
      </div>

      <div className="stepper">
        <button
          type="button"
          aria-label="Decrease 10 grams"
          onClick={() => setGrams(item.grams - STEP_GRAMS)}
          disabled={item.grams <= 0}
        >
          −
        </button>
        {editing ? (
          <input
            className="grams-input"
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="Grams"
          />
        ) : (
          <button
            type="button"
            className="grams-value"
            aria-label={`${item.grams} grams, tap to edit`}
            onClick={() => {
              setDraft(String(item.grams));
              setEditing(true);
            }}
          >
            {item.grams}g
          </button>
        )}
        <button type="button" aria-label="Increase 10 grams" onClick={() => setGrams(item.grams + STEP_GRAMS)}>
          +
        </button>
      </div>

      <button type="button" className="remove" aria-label="Remove item" onClick={onRemove}>
        ×
      </button>
    </li>
  );
}
