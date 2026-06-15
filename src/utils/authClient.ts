const AUTH_API = process.env.MAGICSTACK_AUTH_API || '';
import { Request } from 'express';
import { getRequestId, log } from './requestContext';

export function getFetch() {
  const f = (globalThis as any).fetch as typeof globalThis.fetch;
  if (!f) throw new Error('Global fetch is not available in this runtime');

  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const requestId = getRequestId();
    const headers = new Headers(init?.headers);
    headers.set('X-Request-ID', requestId);
    const urlStr = typeof url === 'string' ? url : url.toString();
    const method = init?.method ?? 'GET';
    log('info', `[fetch] ${requestId} → ${method} ${urlStr}`);
    const start = Date.now();
    const response = await f(url, { ...init, headers });
    log('info', `[fetch] ${requestId} ← ${response.status} ${Date.now() - start}ms`);
    return response;
  };
}

export interface TenantResponse {
  tenant: {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
    owner: string;
    date_created: string;
  };
  properties: Array<{ name: string; value: string }>;
  settings: Record<string, any>;
}

export async function validateToken(bearerToken: string): Promise<any> {
  if (!AUTH_API) throw new Error('MAGICSTACK_AUTH_API is not configured');
  const url = `${AUTH_API.replace(/\/$/, '')}/validate`;

  const fetchFn = getFetch();

  const res = await fetchFn(url, {
    method: 'GET',
    headers: {
      Authorization: bearerToken,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token validation failed: ${res.status} ${text}`);
  }

  return res.json();
}

export function getUserJwt(req: Request): string | undefined {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return undefined;
  // Ensure the value is a Bearer token string (e.g. "Bearer ey...")
  return header.startsWith('Bearer ') ? header : `Bearer ${header}`;
}

export async function fetchTenant(tenantId: string, bearerToken?: string): Promise<TenantResponse> {
  if (!AUTH_API) throw new Error('MAGICSTACK_AUTH_API is not configured');
  const url = `${AUTH_API.replace(/\/$/, '')}/tenant/`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
  };

  if (bearerToken) headers.Authorization = bearerToken;

  const fetchFn = getFetch();

  console.log(`[fetchTenant] GET ${url} (tenant: ${tenantId})`);
  const res = await fetchFn(url, { method: 'GET', headers });
  const rawText = await res.text();
  console.log(`[fetchTenant] response ${res.status} body: ${rawText}`);

  if (!res.ok) {
    throw new Error(`Fetch tenant failed: ${res.status} ${rawText}`);
  }

  let body: TenantResponse;
  try {
    body = JSON.parse(rawText) as TenantResponse;
  } catch (e) {
    throw new Error(`Fetch tenant returned non-JSON (status ${res.status}): ${rawText.slice(0, 200)}`);
  }
  return body;
}

export async function fetchSecret(tenantId: string, secretName: string, apiKey: string, hostname: string, bearerToken?: string): Promise<{ name: string; value: string } | null> {
  if (!AUTH_API) throw new Error('MAGICSTACK_AUTH_API is not configured');
  const url = `${AUTH_API.replace(/\/$/, '')}/tenant/secrets/${encodeURIComponent(secretName)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
    'X-APIKEY': apiKey,
    'X-Hostname': hostname,
  };

  if (bearerToken) headers.Authorization = bearerToken;

  const fetchFn = getFetch();

  console.log(`[fetchSecret] GET ${url} (tenant: ${tenantId}, secret: ${secretName})`);
  const res = await fetchFn(url, { method: 'GET', headers });
  const rawText = await res.text();
  console.log(`[fetchSecret] response ${res.status} body: ${rawText}`);

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Fetch secret failed: ${res.status} ${rawText}`);
  }

  let body: { name: string; value: string };
  try {
    body = JSON.parse(rawText) as { name: string; value: string };
  } catch (e) {
    throw new Error(`Fetch secret returned non-JSON (status ${res.status}): ${rawText.slice(0, 200)}`);
  }
  return body;
}

export async function fetchUser(
  tenantId: string,
  userId: string,
  apiKey: string,
  hostname: string,
  bearerToken?: string,
): Promise<{ email: string; displayName?: string } | null> {
  if (!AUTH_API) throw new Error('MAGICSTACK_AUTH_API is not configured');
  const url = `${AUTH_API.replace(/\/$/, '')}/user/${encodeURIComponent(userId)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': tenantId,
    'X-APIKEY': apiKey,
    'X-Hostname': hostname,
  };
  if (bearerToken) headers.Authorization = bearerToken;

  const fetchFn = getFetch();
  const res = await fetchFn(url, { method: 'GET', headers });
  if (res.status === 404) return null;
  if (res.status === 400) {
    const text = await res.text();
    console.error(`fetchUser: invalid user id (${userId}) — ${text}`);
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch user failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ email: string; displayName?: string }>;
}

const KEYS_API = (process.env.MAGICSTACK_KEYS_API || '').replace(/\/$/, '');

export async function fetchApiKeyProperty(
  apiKey: string,
  tenantId: string,
  propertyName: string,
): Promise<string | undefined> {
  const fetchFn = getFetch();
  const url = `${KEYS_API}/apikey/${encodeURIComponent(apiKey)}/property/${encodeURIComponent(propertyName)}`;
  log('info', `[fetchApiKeyProperty] GET ${url} (tenant: ${tenantId})`);
  const res = await fetchFn(url, {
    headers: { Accept: 'application/json', 'X-Tenant-ID': tenantId },
  });
  log('info', `[fetchApiKeyProperty] response status: ${res.status}`);
  if (!res.ok) {
    log('warn', `[fetchApiKeyProperty] non-OK response for property "${propertyName}" — returning undefined`);
    return undefined;
  }
  const body = await res.json() as { data?: { value?: string } };
  return body.data?.value;
}

export default { validateToken, fetchTenant, fetchSecret, fetchUser, getUserJwt, fetchApiKeyProperty };
