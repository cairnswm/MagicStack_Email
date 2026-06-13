# System Overview

This is the **MagicStack Email Service** — a multi-tenant email delivery platform that provides a single, consistent API for sending emails regardless of the underlying email provider (Resend, SendGrid, Amazon SES, Mailgun, SMTP, etc.).

Key responsibilities:
- Email sending via direct content (`POST /send`) and stored templates (`POST /send/{templateCode}`)
- Template management — CRUD operations on `email_template`
- Recipient resolution — user ID → email address via Auth/Tenant Service
- Provider abstraction layer — a normalised `EmailMessage` object is transformed into provider-specific API calls
- Synchronous and asynchronous delivery modes, configured per tenant
- Attachment handling — direct upload or file code via Files Service
- Embedded image handling — direct upload or image code via Imaginary Service
- Comprehensive audit trail (`email`, `email_recipient`, `email_attachment`, `email_image`, `email_event`, `email_template_render`)
- Queue processor for async delivery with retry logic (`email_queue`)
- Email activity log endpoints for administration and audit

Provider credentials are **never stored locally**. They are retrieved dynamically from the Auth/Tenant Service using `getSecretByName` at send time. Tenant configuration (sender details, provider name, delivery mode) is loaded via `getPropertyByName`.

---

# Structure

This is a nodejs and express api template

All routes should be in their won route file.

Do not install new libraries unless expressly asked to do so by the user

All code should be in typescript

# Code Style

Use camelCase for variable and function names.

Files should not exceed 300 lines long. if file exceed this length suggest to the user that the file needs refactoring.


## Required Request Headers

Every API endpoint **requires** the following three headers. The global `tenantMiddleware` enforces their presence and returns `400` if any are missing:

| Header | Description |
|---|---|
| `X-Tenant-ID` | Identifies the tenant. Scopes all data access, templates, configuration, and audit records. |
| `X-APIKEY` | API key of the calling application. Used for permission checks and forwarded to the Auth/Tenant Service when calling `getSecretByName` or `getPropertyByName`. |
| `X-Hostname` | Originating hostname of the caller. Stored in the email audit trail (`email.source_hostname`) for monitoring and security analysis. |

These values are extracted by `tenantMiddleware` and stored on the request as `req.apiKey` and `req.callerHostname` for downstream handlers.

---

## Utility helpers added

The repository includes a few small utility modules to standardize tenant handling, database access, and JWT extraction/validation. Add or use these helpers in routes and middleware where appropriate.

- `src/utils/tenant.ts`: Tenant helpers
	- `getTenantId(req: Request): string` — returns the tenant id from `x-tenant-id` header (case-insensitive) or `req.query.tenantId`.
	- `requireTenant(req, res, next)` — express middleware that returns `400` when tenant id is missing; stores tenant id on `res.locals.tenantId` for downstream handlers.
	- `getTenantOrRespond(req, res): string | null` — returns tenant id or responds with `400`.

- `src/utils/db.ts`: Database access pattern
	- `withConnection(fn)` — acquires a connection from the pool, runs `fn(conn)`, and always releases the connection in `finally`.
	- `query(sql, params)` — convenience wrapper that runs a query using the `withConnection` pattern and returns rows.

- `src/utils/authClient.ts`: JWT helpers
	- `getUserJwt(req: Request): string | undefined` — extracts the `Authorization` header and ensures a `Bearer ` prefix (returns undefined when no header present).
	- `validateToken(bearerToken: string)` — existing function that calls the configured auth API to validate tokens.

Use these helpers to keep routes small and to prevent connection leaks and inconsistent tenant checks.

- `src/utils/formatters.ts`: Formatting helpers
	- `parseJsonFields(row: any): any` — inspects an object's string fields and attempts to JSON.parse them; when a field contains JSON it replaces the string with the parsed object. Useful for rows returned from the DB where JSON is stored as text.
	- `successResponse(data: any): { data: any }` — standard success envelope for API responses.
	- `errorResponse(message: string): { error: { message: string } }` — standard error envelope for API responses.

Use `parseJsonFields` to normalize DB rows before returning them, and use `successResponse` / `errorResponse` to keep API responses consistent.

- `src/routes/tenant.ts`: Auth/Tenant proxy routes
	- `GET /tenant/property/:name` → **`getPropertyByName`** — reads a named property from the tenant's cached properties. Returns `{ name, value }` or `404`.
	- `GET /tenant/secret/:name` → **`getSecretByName`** — retrieves a named secret from the Auth/Tenant Service via `authClient.fetchSecret`. Returns `{ name, value }` or `404`. Both `X-APIKEY` and `X-Hostname` are forwarded to the Auth/Tenant Service so it can authorise the secret access request.

Tenant middleware:
- Use the `requireTenant` middleware from `src/middleware/tenantMiddleware.ts` to enforce a tenant on routes. It returns a `400` when no tenant is provided and sets the tenant id on `res.locals.tenantId` for handlers. For optional checks, use `getTenantId(req)` from `src/utils/tenant.ts` directly.

## Conventions enforced by code review

- **Never redefine `getTenantId` locally in a route file.** Always import it from `src/utils/tenant.ts`. Route-local variants (e.g. checking `req.params.id` or `req.params.tenantId`) are dead code — those params are never set by the existing route definitions.
- **Never call `pool.getConnection()` directly in route handlers.** Always use `withConnection(fn)` from `src/utils/db.ts`; it guarantees the connection is released in `finally` and prevents pool exhaustion.
- **Never construct `{ error: { message } }` or `{ data: ... }` inline.** Use `errorResponse(message)` and `successResponse(data)` from `src/utils/formatters.ts` so all API responses stay consistent.
- **Do not make network calls inside `tenantUtils.getProperty` / `tenantUtils.getSetting`.** These helpers should read from the already-cached `tenantUtils.properties` / `tenantUtils.settings` populated during middleware init. Only `tenantUtils.refresh()` should call `fetchTenant` again.
- **Do not duplicate the global fetch guard.** `src/utils/authClient.ts` exposes a `getFetch()` helper; use it rather than re-checking `globalThis.fetch` in every function.
- **Always include `X-Tenant-ID`, `X-APIKEY`, and `X-Hostname` on every request.** The global `tenantMiddleware` enforces all three and returns `400` with a descriptive message listing the missing headers if any are absent. Never call an endpoint without all three.
- **Forward `X-APIKEY` and `X-Hostname` to the Auth/Tenant Service** when calling `getSecretByName`. The Auth/Tenant Service uses these values to authorise credential access. Do not strip them.

