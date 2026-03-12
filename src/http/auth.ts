import type { Request, Response, NextFunction } from 'express';
import { cfg } from '../config.js';

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!cfg.http.apiKey) {
    res.status(503).json({ error: 'Server not configured: CEREBELLUM_API_KEY not set' });
    return;
  }
  if (!header?.startsWith('Bearer ') || header.slice(7) !== cfg.http.apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
