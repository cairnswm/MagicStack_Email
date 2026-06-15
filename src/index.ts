import 'dotenv/config';
import express, { Request, Response } from 'express';
import dbRouter from './routes/db';
import healthRouter from './routes/health';
import tenantMiddleware from './middleware/tenantMiddleware';
import tenantRouter from './routes/tenant';
import sampleRouter from './routes/sample';
import paymentRouter from './routes/payment';
import docsRouter from './routes/docs';
import sendRouter from './routes/send';
import templateRouter from './routes/template';
import logsRouter from './routes/logs';

const app = express();
const PORT = process.env.PORT || 3076;
const BASE_PATH = (process.env.BASE_PATH || '/').replace(/\/$/, '');

app.use(express.json());
app.use(express.static('public'));

// Health routes are public — register before tenantMiddleware
app.use(`${BASE_PATH}/health`, healthRouter);

// Attach tenant / auth helpers to every request
app.use(tenantMiddleware as any);

// CORS middleware
const corsHostsEnv = process.env.CORS_HOSTS || '';
const corsHeadersEnv = process.env.CORS_HEADERS || '';
// If CORS_HOSTS is set to the string 'true' (case-insensitive) we allow all hosts
const corsAllowAll = corsHostsEnv.trim().toLowerCase() === 'true';
const defaultCorsHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'];
const extraCorsHeaders = corsHeadersEnv
  .split(',')
  .map(h => h.trim())
  .filter(Boolean);
const allowedCorsHeaders = Array.from(new Set([...defaultCorsHeaders, ...extraCorsHeaders])).join(', ');

app.use((req: Request, res: Response, next) => {
  const origin = req.get('origin');

  if (corsAllowAll || !corsHostsEnv) {
    // allow all hosts when CORS_HOSTS is 'true' or when CORS_HOSTS is not set (public by default)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const allowedHosts = corsHostsEnv.split(',').map(h => h.trim()).filter(Boolean);
    if (origin && allowedHosts.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', allowedCorsHeaders);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

app.use(`${BASE_PATH}/db`, dbRouter);
app.use(`${BASE_PATH}/tenant`, tenantRouter);
app.use(`${BASE_PATH}/sample`, sampleRouter);
app.use(`${BASE_PATH}/payment`, paymentRouter);
app.use(`${BASE_PATH}/send`, sendRouter);
app.use(`${BASE_PATH}/template`, templateRouter);
app.use(`${BASE_PATH}/logs`, logsRouter);
app.use(BASE_PATH || '/', docsRouter);
app.use(`${BASE_PATH}/docs`, docsRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Base path: ${BASE_PATH || '/'}`);
});
