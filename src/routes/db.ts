import { Router, Request, Response } from 'express';
import { withConnection } from '../utils/db';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  try {
    await withConnection(async (conn) => {
      await conn.query('SELECT 1 as result');
    });

    res.json({
      service: 'email',
      status: 'ok',
      deployed_at: process.env.DEPLOYED_AT || null,
      message: 'Database connection successful',
      database: process.env.DB_NAME || 'test',
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      service: 'email',
      status: 'error',
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
