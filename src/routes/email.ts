import { Router, Request, Response } from 'express';
import { errorResponse } from '../utils/formatters';
import { getFetch } from '../utils/authClient';
import { log } from '../utils/requestContext';

const router = Router();

const KEYS_API = (process.env.MAGICSTACK_KEYS_API || '').replace(/\/$/, '');

async function getApiKeyProperty(apiKey: string, tenantId: string, propertyName: string): Promise<string | undefined> {
  const fetch = getFetch();
  const url = `${KEYS_API}/apikey/${encodeURIComponent(apiKey)}/property/${encodeURIComponent(propertyName)}`;
  log('info', `[getApiKeyProperty] GET ${url} (tenant: ${tenantId})`);
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-Tenant-ID': tenantId,
    },
  });
  log('info', `[getApiKeyProperty] response status: ${response.status}`);
  if (!response.ok) {
    log('warn', `[getApiKeyProperty] non-OK response for property "${propertyName}" — returning undefined`);
    return undefined;
  }
  const body = await response.json() as { data?: { value?: string } };
  console.log("[getApiKeyProperty] response body:", body);
  const value = body.data?.value;
  log('info', `[getApiKeyProperty] property "${propertyName}" value: ${JSON.stringify(value)}`);
  return value;
}

// POST /send — send an email directly without a stored template.
// The tenant's API key must have the property sendByEmail set to true or 1 in the keystore.
router.post('/send', async (req: Request, res: Response) => {
  try {
    const apiKey = (req as any).apiKey as string;
    const tenantId = req.header('x-tenant-id') || req.header('X-Tenant-ID') || '';
    const sendByEmail = await getApiKeyProperty(apiKey, tenantId, 'sendByEmail');
    const allowed = sendByEmail === 'true' || sendByEmail === '1';

    if (!allowed) {
      return res.status(403).json(errorResponse('API key is not authorised to send emails. The sendByEmail property must be enabled for this tenant.'));
    }

    // TODO: implement email delivery
    return res.status(501).json(errorResponse('Email sending is not yet implemented'));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

export default router;
