import express from 'express';
import { bearerAuth } from './auth.js';
import { router as apiRouter } from './routes/api.js';
import { handleMcpRequest } from './mcp.js';

export function startServer(port: number) {
  const app = express();
  app.use(express.json());

  // Health check — no auth (usable by PM2 health checks and monitoring)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), version: '0.1.0' });
  });

  // All other routes require bearer auth
  app.use(bearerAuth);
  app.use('/api', apiRouter);
  app.post('/mcp', handleMcpRequest);

  // Bind to loopback only — no access from other hosts on the network
  return app.listen(port, '127.0.0.1', () => {
    console.log(`[cerebellum] HTTP daemon running on http://127.0.0.1:${port}`);
  });
}
