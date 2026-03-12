import { Router, Request, Response } from 'express';
import { captureThought } from '../../capture.js';
import { searchByEmbedding, listRecent, getStats } from '../../db.js';
import { generateEmbedding } from '../../embeddings.js';

export const router = Router();

/**
 * POST /capture
 * Capture a new thought from API
 */
router.post('/capture', async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    // Validate required field
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Missing or invalid required field: content' });
      return;
    }

    // Capture with source locked to 'api'
    const result = await captureThought(content, 'api');

    res.json({
      success: true,
      id: result.thought.id,
      elapsed_ms: result.elapsed_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /search?q=&limit=&threshold=
 * Search thoughts by semantic similarity
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, limit, threshold } = req.query;

    // Validate required field
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Missing or invalid required parameter: q' });
      return;
    }

    // Parse optional params with defaults
    const searchLimit = limit ? parseInt(limit as string, 10) : 10;
    const searchThreshold = threshold ? parseFloat(threshold as string) : 0.7;

    // Validate parsed values
    if (isNaN(searchLimit) || searchLimit < 1) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }
    if (isNaN(searchThreshold) || searchThreshold < 0 || searchThreshold > 1) {
      res.status(400).json({ error: 'threshold must be a number between 0 and 1' });
      return;
    }

    // Generate embedding for query
    const embedding = await generateEmbedding(q);

    // Search by embedding
    const results = await searchByEmbedding(embedding, searchLimit, searchThreshold);

    res.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /recent?days=&limit=
 * Get recent thoughts
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const { days, limit } = req.query;

    // Parse optional params with defaults
    const recentDays = days ? parseInt(days as string, 10) : 7;
    const recentLimit = limit ? parseInt(limit as string, 10) : 20;

    // Validate parsed values
    if (isNaN(recentDays) || recentDays < 1) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }
    if (isNaN(recentLimit) || recentLimit < 1) {
      res.status(400).json({ error: 'limit must be a positive integer' });
      return;
    }

    // Get recent thoughts
    const thoughts = await listRecent(recentDays, recentLimit);

    res.json({ thoughts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /stats
 * Get system statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});
