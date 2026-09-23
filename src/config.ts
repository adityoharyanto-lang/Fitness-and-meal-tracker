export const config = {
  port: Number(process.env.PORT) || 3000,
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.6-flash',
  geminiTimeoutMs: 20_000,
  upload: {
    maxBytes: 8 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png'] as const,
  },
  analysisTtlMs: 60 * 60 * 1000,
  analyzeRateLimit: {
    windowMs: 60 * 1000,
    max: 20,
  },
};
