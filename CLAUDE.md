# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MagicStack Email Service: a multi-tenant Express + TypeScript API that sends email through a provider abstraction (Resend, SMTP, etc.), with stored templates, recipient resolution, and an audit trail in MySQL. Schema is in `.github/database.sql`; API spec in `.github/api-specification.md`; template language in `.github/template-language.md`.

## Commands

- `npm run dev` — nodemon + ts-node (`predev` kills whatever is listening on `PORT` from `.env`, Windows-only via netstat/taskkill)
- `npm run build` — `tsc` then copies `package.json`, `.env`, `public/` into `dist/`
- `npm start` — runs `dist/index.js`
- `npm run deploy` — FTP upload of `dist` (does NOT restart the app); `npm run publish` = build + deploy

There is no test runner or linter. Endpoints are exercised manually with REST Client `.http` files in `.http/`. **When adding or changing an endpoint, create/update the matching `.http` file.**

Config comes from `.env` (copy `example.env`). `BASE_PATH` must match the deployed path; all routes are mounted under it in `src/index.ts`.

## Architecture

- **Request flow** (`src/index.ts`): `/health` and `/db` are public → `tenantMiddleware` → CORS → routers (`send`, `template`, `logs`, `tenant`, `docs*`). Every non-health request requires `X-Tenant-ID`, `X-APIKEY`, `X-Hostname` (400 otherwise); middleware sets `req.apiKey`, `req.callerHostname`, and `req.tenantUtils` (cached tenant properties/settings).
- **Provider credentials are never stored locally.** Secrets are fetched at send time from the external Auth/Tenant service (`src/utils/authClient.ts`, `MAGICSTACK_AUTH_API`), forwarding `X-APIKEY`/`X-Hostname`. Tenant config (`email_provider`, `sender_name`, `sender_email`, `email_delivery_mode`, `smtp_*`) comes from tenant properties via `tenantUtils.getProperty`. For SMTP, `smtp_username` is the sender address.
- **Send pipeline** (`src/routes/send.ts` → `services/emailService.ts` → `providers/emailProvider.ts`): check API key's `sendByEmail` property (needed for raw-email recipients, else 403) → resolve recipients (userId via auth service) → create `email` records/audit rows → send via provider (sync) or queue (`email_queue`).
- **Template engine** is custom, split across `src/services/template*.ts`: `templateRenderer` (parser/renderer: `{{expr}}`, `if/else`, `each`, `part.<code>`), `templateExpression` (expression evaluator), `templateParts` (reusable parts loaded per tenant), `templateConfig` (config/debug flags), `templateShared` (types, escaping, path resolution).
- `docs*` routes serve HTML documentation pages.

## Conventions (enforced in review, from `.github/copilot-instructions.md`)

- TypeScript only; camelCase; one router per route file; don't add dependencies unless asked; suggest refactoring if a file exceeds 300 lines.
- Import `getTenantId` from `src/utils/tenant.ts` — never redefine it locally.
- Never call `pool.getConnection()` in handlers; use `withConnection`/`query` from `src/utils/db.ts`.
- Use `successResponse` / `errorResponse` from `src/utils/formatters.ts`; never build `{ data }` / `{ error: { message } }` inline. Use `parseJsonFields` on DB rows with JSON text columns.
- `tenantUtils.getProperty`/`getSetting` must read cached values only; only `tenantUtils.refresh()` may refetch.
- Use `getFetch()` from `authClient.ts` rather than re-checking `globalThis.fetch`.
- Always forward `X-APIKEY` and `X-Hostname` to the Auth/Tenant service.

## Notes

- `.github/skills/send-email/SKILL.md` is a skill for consumers of the hosted service (not for developing this repo).
- `example.env` contains FTP deploy values; `.env` is copied into `dist/` on build.
