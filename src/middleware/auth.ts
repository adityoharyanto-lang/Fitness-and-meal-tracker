import { NextFunction, Request, Response } from 'express';

/**
 * Auth stub: trusts the x-user-id header as the caller's identity.
 * Replace with real token verification (JWT/session) before production.
 */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const userId = req.header('x-user-id')?.trim();
  if (!userId) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing x-user-id header' });
    return;
  }
  req.userId = userId;
  next();
}
