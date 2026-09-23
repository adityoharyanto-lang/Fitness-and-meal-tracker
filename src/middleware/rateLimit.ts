import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

/** Per-user limiter for the analyze endpoint. Must run after requireUser. */
export const analyzeRateLimiter = rateLimit({
  windowMs: config.analyzeRateLimit.windowMs,
  limit: config.analyzeRateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.userId as string,
  message: { error: 'rate_limited', message: 'Too many analyze requests, try again in a minute' },
});
