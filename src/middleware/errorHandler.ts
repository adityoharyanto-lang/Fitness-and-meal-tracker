import { NextFunction, Request, Response } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // express.json() parse failures carry a 4xx status
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: 'bad_request', message: (err as Error).message });
    return;
  }
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'internal_error' });
}
