import { Request, Response, NextFunction } from 'express';
import * as authClient from '../utils/authClient';
import { requestStorage, generateRequestId, log } from '../utils/requestContext';

interface TenantUtils {
  tenant?: any;
  properties?: Array<{ name: string; value: string }>;
  settings?: Record<string, any>;
  getProperty: (name: string) => Promise<string | undefined>;
  getSetting: (name: string) => Promise<any>;
  getSecret: (name: string) => Promise<string | undefined>;
  refresh: () => Promise<void>;
}

const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const OPEN_PATHS = new Set([
  basePath || '/',
  `${basePath}/`,
  `${basePath}/health`,
  `${basePath}/db/health`,
]);
// Any path that starts with one of these prefixes is also open (no headers required)
const OPEN_PREFIXES = [`${basePath}/docs`];

export default function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip header enforcement for open/health/docs paths
  if (OPEN_PATHS.has(req.path) || OPEN_PREFIXES.some(p => req.path.startsWith(p))) {
    const requestId = req.header('x-request-id') || generateRequestId();
    (req as any).requestId = requestId;
    requestStorage.run({ requestId }, () => next());
    return;
  }

  // Enforce the three required headers on every request
  const tenantId = req.header('x-tenant-id') || req.header('X-Tenant-ID') || '';
  const apiKey = req.header('x-apikey') || req.header('X-APIKEY') || '';
  const callerHostname = req.header('x-hostname') || req.header('X-Hostname') || '';

  const missing = [
    !tenantId ? 'X-Tenant-ID' : null,
    !apiKey ? 'X-APIKEY' : null,
    !callerHostname ? 'X-Hostname' : null,
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    res.status(400).json({ error: { message: `Missing required headers: ${missing.join(', ')}` } });
    return;
  }

  // Expose on request for downstream handlers
  (req as any).apiKey = apiKey;
  (req as any).callerHostname = callerHostname;

  const requestId = req.header('x-request-id') || generateRequestId();
  (req as any).requestId = requestId;
  requestStorage.run({ requestId }, () => {
    initTenantContext(req, res, next).catch(next);
  });
}

async function initTenantContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header('authorization') || req.header('Authorization') || '';
  const tenantId = req.header('x-tenant-id') || req.header('X-Tenant-ID') || '';
  const apiKey = (req as any).apiKey as string || '';
  const callerHostname = (req as any).callerHostname as string || '';

  // Attach auth helpers
  (req as any).authClient = {
    validateToken: authClient.validateToken,
    fetchTenant: authClient.fetchTenant,
  };

  // Attach a default tenantUtils object. We'll try to populate if X-Tenant-ID provided.
  const tenantUtils: TenantUtils = {
    tenant: undefined,
    properties: [],
    settings: {},
    getProperty: async (name: string) => undefined,
    getSetting: async (name: string) => undefined,
    getSecret: async (name: string) => undefined,
    refresh: async () => {},
  };

  if (tenantId) {
    try {
      const data = await authClient.fetchTenant(tenantId, authHeader || undefined, callerHostname);

      tenantUtils.tenant = data.tenant;
      tenantUtils.properties = data.properties || [];
      tenantUtils.settings = data.settings || {};
      log('info', `[tenantMiddleware] fetched ${tenantUtils.properties.length} properties for tenant ${tenantId}: ${tenantUtils.properties.map(p => p.name).join(', ')}`);
      tenantUtils.getProperty = async (name: string) => {
        const prop = (tenantUtils.properties || []).find(p => p.name === name);
        return prop ? prop.value : undefined;
      };
      tenantUtils.getSetting = async (name: string) => {
        return tenantUtils.settings ? tenantUtils.settings[name] : undefined;
      };
      tenantUtils.getSecret = async (name: string) => {
        const secret = await authClient.fetchSecret(tenantId, name, apiKey, callerHostname, authHeader || undefined);
        return secret?.value;
      };
      tenantUtils.refresh = async () => {
        const fresh = await authClient.fetchTenant(tenantId, authHeader || undefined, callerHostname);
        tenantUtils.tenant = fresh.tenant;
        tenantUtils.properties = fresh.properties || [];
        tenantUtils.settings = fresh.settings || {};
      };
    } catch (err) {
      console.error('[tenantMiddleware] fetchTenant failed for tenant', tenantId, ':', err);
      next(err);
      return;
    }
  }

  (req as any).tenantUtils = tenantUtils;

  // Also attach a convenience method to validate token on demand
  (req as any).validateToken = async (token?: string) => {
    const t = token || authHeader;
    if (!t) throw new Error('No Authorization token provided');
    return authClient.validateToken(t, callerHostname);
  };

  next();
}
