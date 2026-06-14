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

  const res = await fetchFn(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch tenant failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as TenantResponse;
  return body;
}

export async function fetchSecret(tenantId: string, secretName: string, apiKey: string, hostname: string, bearerToken?: string): Promise<{ name: string; value: string } | null> {
  if (!AUTH_API) throw new Error('MAGICSTACK_AUTH_API is not configured');
  const url = `${AUTH_API.replace(/\/$/, '')}/tenant/secret/${encodeURIComponent(secretName)}`;

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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fetch secret failed: ${res.status} ${text}`);
  }

  const body = (await res.json()) as { name: string; value: string };
  return body;
}

export default { validateToken, fetchTenant, fetchSecret, getUserJwt };
