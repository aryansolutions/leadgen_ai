import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

router.get('/', async (_request, response) => {
  try {
    await query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

export default router;
