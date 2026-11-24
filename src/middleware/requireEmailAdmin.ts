import { Request, Response, NextFunction } from 'express';
import { getUserJwt, validateToken } from '../utils/authClient';
import { getTenantId } from '../utils/tenant';
import { errorResponse } from '../utils/formatters';
import { log } from '../utils/requestContext';

const ALLOWED_ROLES = new Set(['admin', 'email controller']);

// Only call after the Auth service has validated the token: the signed payload is then trustworthy.
function decodeJwtPayload(bearer: string): any {
  try {
    const token = bearer.replace(/^Bearer\s+/i, '');
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function extractRoleNames(bearer: string): string[] {
  const raw = decodeJwtPayload(bearer)?.roles ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => (typeof r === 'string' ? r : r?.name ?? r?.role))
    .filter((n: unknown): n is string => typeof n === 'string')
    .map(n => n.trim().toLowerCase());
}

/**
 * Requires a valid bearer token whose user has the "Admin" or "Email Controller" role.
 * The token is verified by the Auth service (never decoded locally), so roles cannot be forged.
 */
export default async function requireEmailAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Let CORS preflight through; browsers never attach credentials to it
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const bearer = getUserJwt(req);
  if (!bearer) {
    res.status(401).json(errorResponse('Authorization bearer token is required'));
    return;
  }

  let validated: any;
  try {
    validated = await validateToken(bearer, (req as any).callerHostname || '', getTenantId(req));
  } catch (err) {
    log('warn', `[requireEmailAdmin] token validation failed: ${(err as Error).message}`);
    res.status(401).json(errorResponse('Invalid or expired token'));
    return;
  }

  const roles = extractRoleNames(bearer);
  if (!roles.some(r => ALLOWED_ROLES.has(r))) {
    log('warn', `[requireEmailAdmin] denied; roles=[${roles.join(', ')}]`);
    res.status(403).json(errorResponse('Requires the Admin or Email Controller role'));
    return;
  }

  next();
}
