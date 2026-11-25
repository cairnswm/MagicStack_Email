# MagicStack Email Service API

This document describes the HTTP API implemented by the service. Replace
`{basePath}` with the configured `BASE_PATH` (omit it when the service is
deployed at the domain root).

## What the API does

The service provides tenant-scoped email delivery through configured providers,
such as SMTP or an API-based provider. Callers can send a fully composed email
or render and send an active stored template. It also manages templates,
exposes tenant configuration and secrets through the Auth/Tenant Service, and
provides email delivery and audit logs.

## Authentication and common behavior

Most API endpoints require these headers:

```http
X-Tenant-ID: {tenantId}
X-APIKEY: {apiKey}
X-Hostname: {callingHostname}
Content-Type: application/json
```

`X-Tenant-ID` scopes templates, email records, and tenant configuration.
`X-Hostname` identifies the calling application in audit records and is
forwarded to the Auth/Tenant Service. `X-APIKEY` identifies the application and
is used for send permissions and secret access. Send requests need an API key;
an `Authorization: Bearer {token}` header does not replace it for sending.

The health checks and `/docs...` pages are public and do not require the
tenant headers. Browser `OPTIONS` preflight requests are handled before header
validation.

Administrative endpoints (`/template...`, `/template-parts...`, and `/logs...`) additionally require
an `Authorization: Bearer {token}` token validated by the Auth Service. The
token must have the `Admin` or `Email Controller` role.

Most successful API responses use this envelope:

```json
{ "data": {} }
```

Errors generally use:

```json
{ "error": { "message": "Description of the error" } }
```

Some tenant property/setting/secret responses and health checks return their
payload directly.

## Email delivery flow

1. The service validates the tenant context and send permission. API keys must
   have the `sendByEmail` permission to use direct email-address recipients;
   user-ID recipients are resolved through the Auth/Tenant Service.
2. The service reads provider, sender, and delivery-mode properties from the
   tenant configuration. Provider credentials are fetched from the
   Auth/Tenant Service when needed; credentials are not stored by this API.
3. The service writes the email and audit records. In `sync` mode, it sends
   immediately and returns `200` with `sent`. Other delivery modes enqueue the
   email and return `202` with `queued`.
4. Email logs expose the resulting status, recipients, and chronological event
   history.

For SMTP, configure `smtp_host`, `smtp_port`, `smtp_username`, and the `smtp`
secret. For other providers, configure `sender_email` and `sender_name`, the
`email_provider` property, and a secret named for the provider. Configure
`email_delivery_mode` as `sync` for immediate delivery; a non-`sync` value
uses the queue.

## Endpoint reference

### Health and service status

| Method and path | Access | Description |
|---|---|---|
| `GET {basePath}/health` | Public | Service health and runtime information, including uptime and memory usage. |
| `GET {basePath}/health/services` | Public | Checks health URLs for configured `MAGICSTACK_*` services. Returns `200` when all are healthy or `207` when one or more checks fail. |
| `GET {basePath}/health/db` | Public | Database diagnostics, including connection and performance information. |
| `GET {basePath}/db/health` | Public | Database health check; returns `503` if the database check fails. |

### Send email

| Method and path | Access | Description |
|---|---|---|
| `POST {basePath}/send` | Tenant headers | Sends an email from request content. |
| `POST {basePath}/send/{templateCode}` | Tenant headers | Renders an active tenant template with parameters, then sends it. |
| `POST {basePath}/send/{templateCode}/preview` | Tenant headers | Renders an active template without sending or creating an email record. |

Direct email request:

```json
{
  "subject": "Order received",
  "htmlBody": "<p>Thanks for your order.</p>",
  "to": [{ "email": "customer@example.com" }],
  "cc": [{ "userId": "user-123" }],
  "bcc": [],
  "attachments": [],
  "images": []
}
```

`subject`, `htmlBody`, and a non-empty `to` list are required. A recipient can
identify a registered user with `userId` or supply an `email` address. `cc`,
`bcc`, `attachments`, and `images` are optional.

Template send request:

```json
{
  "to": [{ "userId": "user-123" }],
  "parameters": {
    "customer": { "first_name": "Amina" },
    "order": { "reference": "ORD-1042" }
  }
}
```

`to` and `parameters` are required. Optional `cc`, `bcc`, `attachments`, and
`images` use the same shapes as direct send. Successful sends return
`emailId`, `emailCode`, `status`, and `provider`; template sends also return
`templateCode`. A queued send returns HTTP `202`; synchronous completion returns
HTTP `200`. Errors include invalid/missing input, missing tenant sender/provider
configuration, insufficient direct-email permission, and provider failures.

The preview endpoint accepts `parameters` and returns the rendered subject,
HTML, template ID/code, and render data. It does not send an email.

Attachment and image entries can refer to an uploaded value or a service
resource:

```ts
type EmailAttachment =
  | { type: "upload"; filename?: string; contentType?: string; content?: string }
  | { type: "file"; filename?: string; contentType?: string; fileCode: string };

type EmailImage =
  | { type: "upload"; filename?: string; contentType?: string; content?: string }
  | { type: "imaginary"; filename?: string; contentType?: string; imageCode: string };
```

### Template management

These endpoints require both tenant headers and an administrator token with the
`Admin` or `Email Controller` role.

| Method and path | Description |
|---|---|
| `GET {basePath}/template` | Lists this tenant's templates, including inactive templates. |
| `GET {basePath}/template/{code}` | Gets a template and its subject/HTML source, config, and timestamps. |
| `POST {basePath}/template` | Creates a template. Also supports the legacy render-preview body described below. |
| `POST {basePath}/template/render` | Renders a stored or inline template without sending. |
| `PUT {basePath}/template/{code}` | Updates supplied fields on a tenant-owned template. |
| `DELETE {basePath}/template/{code}` | Soft-deletes a template by marking it inactive. |

Create request:

```json
{
  "code": "order-receipt",
  "name": "Order receipt",
  "description": "Receipt sent after purchase",
  "subjectTemplate": "Order {{order.reference}} received",
  "htmlTemplate": "<p>Hello {{customer.first_name}}, thank you.</p>",
  "config": {}
}
```

`code`, `name`, `subjectTemplate`, and `htmlTemplate` are required. Codes must
be unique for the tenant. `description` and `config` are optional.

Update accepts any subset of `name`, `description`, `subjectTemplate`,
`htmlTemplate`, `config`, and `isActive`. It must contain at least one field.
Deleting a template only makes it inactive; existing email records are not
changed.

Render request (choose a stored template by `id` or `slug`, or provide inline
template text):

```json
{
  "slug": "order-receipt",
  "data": { "customer": { "first_name": "Amina" } },
  "options": {}
}
```

`data` must be an object. Inline rendering uses `template` instead of `id` or
`slug`. Stored template rendering returns rendered subject and HTML; inline
rendering returns the rendered text. The same render request sent to
`POST /template` is treated as a preview; prefer `POST /template/render`.

Templates support variable expressions such as `{{customer.first_name}}`,
fallbacks, conditions, and `each` iteration. Stored HTML output is escaped by
default. See [the template language guide](.github/template-language.md) for
syntax and behavior.

### Template part management

These endpoints require the tenant headers and an administrator token with
the `Admin` or `Email Controller` role. Parts are scoped to the tenant and
can be included in templates using `{{part.header}}`.

| Method and path | Description |
|---|---|
| `GET {basePath}/template-parts` | Lists the tenant's parts, including inactive parts. |
| `GET {basePath}/template-parts/{code}` | Gets a part, including its content and timestamps. |
| `POST {basePath}/template-parts` | Creates a part. |
| `PUT {basePath}/template-parts/{code}` | Updates supplied fields on a part. |
| `DELETE {basePath}/template-parts/{code}` | Soft-deletes a part by marking it inactive. |

Create request:

```json
{
  "code": "header",
  "name": "Email header",
  "description": "Reusable greeting",
  "contentTemplate": "<p>Hello {{customer.first_name}}</p>"
}
```

`code`, `name`, and `contentTemplate` are required; content may be empty.
Codes must be unique per tenant, at most 100 characters, and cannot contain
whitespace, braces, `/`, or `?`, or be `.` or `..`. `name` must be nonblank
and at most 255 characters. `description` is optional and may be a string or
null. A successful creation returns HTTP `201`:

```json
{ "data": { "id": 1, "code": "header" } }
```

The list endpoint returns parts ordered by name:

```json
{
  "data": {
    "parts": [
      { "id": 1, "code": "header", "name": "Email header", "isActive": true }
    ]
  }
}
```

The detail endpoint returns the part's `id`, `code`, `name`, `description`,
`contentTemplate`, `isActive`, `createdAt`, and `updatedAt`.

Update request (all fields are optional, but at least one must be supplied):

```json
{
  "contentTemplate": "<p>Welcome {{customer.first_name}}</p>",
  "description": null,
  "isActive": true
}
```

Updates accept `name`, `description`, `contentTemplate`, and boolean
`isActive`. Successful updates and deletes return HTTP `200` with
`{ "data": { "success": true } }`. Deletion marks the part inactive; it
remains available through management endpoints but is treated as missing
during rendering. Set `isActive` to `true` to restore it.

Invalid input returns `400`, a missing or invalid bearer token returns `401`,
an insufficient role returns `403`, a part not found for the tenant returns
`404`, and a duplicate code returns `409`. See
[template-part requests](.http/template/template-parts.http) for examples,
including previewing a part inside a template.

### Email activity and audit logs

These endpoints require both tenant headers and an administrator token with the
`Admin` or `Email Controller` role.

| Method and path | Description |
|---|---|
| `GET {basePath}/logs/{tenantId}/email` | Returns a paginated email list for the tenant. The path tenant must match `X-Tenant-ID`. |
| `GET {basePath}/logs/{tenantId}/email/{emailCode}` | Returns one email's details, recipients, and events. |

The list endpoint supports `status`, `templateCode`, `fromDate`, `toDate`,
`page`, and `pageSize` query parameters. Defaults are page `1` and page size
`20`; page size is limited to `100`. Date filters apply to email creation time.
The response contains `total`, `page`, `pageSize`, and `items`.

The detail endpoint returns the stored sender, subject and HTML body, current
status, provider identifiers/errors, recipients, and events ordered by event
time. It returns `404` when the email code is not found for the tenant.

### Tenant properties, settings, and secrets

These routes proxy tenant data from the Auth/Tenant Service. They require the
tenant context; use `X-Tenant-ID` even where the route helper also understands
a `tenantId` query parameter.

| Method and path | Description |
|---|---|
| `GET {basePath}/tenant/property` | Returns all tenant properties. |
| `GET {basePath}/tenant/property/{name}` | Returns one property as `{ "name": "...", "value": "..." }`. |
| `GET {basePath}/tenant/setting` | Returns all settings. |
| `GET {basePath}/tenant/setting/{name}` | Returns one setting as `{ "name": "...", "value": ... }`. |
| `GET {basePath}/tenant/secret/{name}` | Retrieves one named secret as `{ "name": "...", "value": "..." }`. |

The secret endpoint forwards the API key, hostname, and optional Authorization
header to the Auth/Tenant Service. Treat its response as sensitive.

### Sample data routes

These database-backed example routes require tenant headers but query the sample
table by ID or name:

| Method and path | Description |
|---|---|
| `GET {basePath}/sample/{id}` | Returns a sample record by numeric ID. |
| `GET {basePath}/sample/name/{name}` | Returns a sample record by name. |

### Interactive documentation pages

The service also serves public HTML documentation:

| Method and path | Description |
|---|---|
| `GET {basePath}/` | Redirects to the configuration documentation page. |
| `GET {basePath}/docs` | Redirects to configuration documentation. |
| `GET {basePath}/docs/overview` | API overview. |
| `GET {basePath}/docs/config` | Header, permission, tenant-property, and provider setup guidance. |
| `GET {basePath}/docs/send` | Email sending guidance. |
| `GET {basePath}/docs/templates` | Template management guidance. |
| `GET {basePath}/docs/logs` | Email activity and audit-log guidance. |
| `GET {basePath}/docs/template-help` | Template language help. |

## Status values

Email statuses used by send responses and activity logs are `queued`,
`processing`, `sent`, `failed`, and `cancelled`.
