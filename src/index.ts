import 'dotenv/config';
import express, { Request, Response } from 'express';
import dbRouter from './routes/db';
import tenantMiddleware from './middleware/tenantMiddleware';
import tenantRouter from './routes/tenant';
import sampleRouter from './routes/sample';
import emailRouter from './routes/email';
import docsEmailRouter from './routes/docsEmail';

const app = express();
const PORT = process.env.PORT || 3076;
const BASE_PATH = (process.env.BASE_PATH || '/').replace(/\/$/, '');

app.use(express.json());
app.use(express.static('public'));

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
app.use(BASE_PATH || '/', emailRouter);
app.use(BASE_PATH || '/', docsEmailRouter);

app.get(`${BASE_PATH}/health`, (req: Request, res: Response) => {
  const deployedAtEnv = process.env.DEPLOYED_AT;
  let deployedAtLocal = 'unknown';

  if (deployedAtEnv) {
    const parsed = new Date(deployedAtEnv);
    if (!isNaN(parsed.getTime())) {
      // convert the UTC/GMT timestamp from env to the server's local time string
      deployedAtLocal = parsed.toLocaleString();
    } else {
      // if parsing fails, return the raw value
      deployedAtLocal = deployedAtEnv;
    }
  }

  res.json({
    service: 'email',
    status: 'ok',
    deployed_at: deployedAtLocal,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Base path: ${BASE_PATH || '/'}`);
});
