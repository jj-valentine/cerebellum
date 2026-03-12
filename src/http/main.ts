import { cfg } from '../config.js';
import { startServer } from './server.js';

startServer(cfg.http.port);
