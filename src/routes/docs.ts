import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const docsPath = `${basePath}/docs`;

function withBasePath(path: string): string {
  return `${basePath}${path}` || path;
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.runeworkz.com/styles.css" />
  </head>
  <body class="app-shell">${body}</body>
</html>`;
}

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderEndpoint(
  method: string,
  path: string,
  title: string,
  description: string,
  requestExample: string,
  responseExample: string,
  paramsHtml = '',
): string {
  const id = `ep-${method.toLowerCase()}${path.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-')}`;
  return `
<section class="doc-card" id="${id}">
  <div class="doc-card-header">
    <span class="http-method ${method}">${method}</span>
    <div>
      <div class="endpoint-path">${path}</div>
      <div class="doc-card-title">${title}</div>
    </div>
  </div>
  <div class="doc-card-body stack">
    <p>${description}</p>
    ${paramsHtml}
    <div class="two-column">
      <div><h4>Request</h4><pre class="code-block">${requestExample}</pre></div>
      <div><h4>Response</h4><pre class="code-block">${responseExample}</pre></div>
    </div>
  </div>
</section>`;
}

const REQ_HEADERS = `X-Tenant-ID: {tenantId}\nX-APIKEY: {apiKey}\nX-Hostname: {hostname}`;

router.get('/', (_req: Request, res: Response) => {
  const body = `
<header class="site-header">
  <span class="base-url">${basePath || '/'}</span>
  <h1>MagicStack Email Service</h1>
  <p>Multi-tenant email delivery platform with provider abstraction, template rendering, and activity logging.</p>
</header>
<nav class="site-nav">
  <a href="#send">Send Email</a>
  <a href="#templates">Templates</a>
  <a href="#logs">Logs</a>
  <a href="${docsPath}/template-help">Template Help</a>
</nav>
<main class="content-shell stack">

<section class="doc-card" id="overview">
  <div class="doc-card-header">
    <div>
      <div class="endpoint-path">API Overview</div>
      <div class="doc-card-title">Email sending, templates, and logs</div>
    </div>
  </div>
  <div class="doc-card-body stack">
    <p><strong>This API provides:</strong></p>
    <ul>
      <li><strong>Direct send</strong> — POST /send with subject and HTML body</li>
      <li><strong>Template send</strong> — POST /send/:templateCode with render parameters</li>
      <li><strong>Template preview</strong> — POST /template/render to validate output before sending</li>
      <li><strong>Template CRUD</strong> — Create, list, update, or delete email templates</li>
      <li><strong>Email logs</strong> — Retrieve sent email records with full audit trail</li>
    </ul>
    <p><strong>Required headers for every request:</strong></p>
    <ul>
      <li><code>X-Tenant-ID</code> — Tenant identifier (scopes all data access)</li>
      <li><code>X-APIKEY</code> — API key for authorization and credential access</li>
      <li><code>X-Hostname</code> — Caller hostname for audit logging</li>
    </ul>
    <p>Missing headers return <code>400</code>. Browse the endpoint docs or see <a href="${docsPath}/template-help">Template Help</a> for detailed guidance.</p>
  </div>
</section>

<h2 id="send">Email Send</h2>

${renderEndpoint('POST', '/send', 'Send email directly',
  'Sends an email with an explicit subject and HTML body. Creates <code>email</code>, <code>email_recipient</code>, <code>email_attachment</code>, <code>email_image</code>, and <code>email_event</code> records. Delivers via provider when <code>email_delivery_mode</code> is <code>sync</code>, or enqueues when <code>async</code>.',
  `POST /send\n${REQ_HEADERS}\nContent-Type: application/json\n\n{\n  "subject": "Hello from MagicStack",\n  "htmlBody": "&lt;h1&gt;Hello!&lt;/h1&gt;&lt;p&gt;Welcome.&lt;/p&gt;",\n  "to": [{ "email": "alice@example.com" }],\n  "cc": [],\n  "bcc": [],\n  "attachments": [],\n  "images": []\n}`,
  `202 Accepted (async)\n{\n  "data": {\n    "emailId": 1,\n    "emailCode": "uuid",\n    "status": "queued",\n    "provider": "resend"\n  }\n}\n\n200 OK (sync)\n{\n  "data": {\n    "emailId": 1,\n    "emailCode": "uuid",\n    "status": "sent",\n    "provider": "resend"\n  }\n}`)}

${renderEndpoint('POST', '/send/:templateCode', 'Send email via template',
  'Loads a tenant-scoped template by code, renders <code>{{key}}</code> placeholders from <code>parameters</code>, stores an <code>email_template_render</code> record, then follows the same send path. Returns <code>404</code> if the template is not found or inactive.',
  `POST /send/welcome-email\n${REQ_HEADERS}\nContent-Type: application/json\n\n{\n  "to": [{ "email": "alice@example.com" }],\n  "parameters": {\n    "firstName": "Alice",\n    "productName": "MagicStack"\n  }\n}`,
  `202 Accepted\n{\n  "data": {\n    "emailId": 2,\n    "emailCode": "uuid",\n    "status": "queued",\n    "provider": "resend",\n    "templateCode": "welcome-email"\n  }\n}`)}

<h2 id="templates">Template Management</h2>

${renderEndpoint('GET', '/template', 'List templates',
  'Returns all email templates for the tenant (id, code, name, isActive).',
  `GET /template\n${REQ_HEADERS}`,
  `200 OK\n{\n  "data": {\n    "templates": [\n      {\n        "id": 1,\n        "code": "welcome-email",\n        "name": "Welcome Email",\n        "isActive": true\n      }\n    ]\n  }\n}`)}

${renderEndpoint('GET', '/template/:code', 'Get template',
  'Returns the full template record for a given code, including subject and HTML template strings.',
  `GET /template/welcome-email\n${REQ_HEADERS}`,
  `200 OK\n{\n  "data": {\n    "id": 1,\n    "code": "welcome-email",\n    "name": "Welcome Email",\n    "description": "Sent on registration",\n    "subjectTemplate": "Welcome, {{firstName}}!",\n    "htmlTemplate": "&lt;h1&gt;Hello {{firstName}}&lt;/h1&gt;",\n    "isActive": true,\n    "createdAt": "2025-01-01T00:00:00Z",\n    "updatedAt": "2025-01-01T00:00:00Z"\n  }\n}`)}

${renderEndpoint('POST', '/template/render', 'Render template preview',
  'Renders a template without sending an email. Accepts either a stored template via <code>id</code> or <code>slug</code>, or inline template text via <code>template</code>. Returns the rendered output for validation.',
  `POST /template/render\n${REQ_HEADERS}\nContent-Type: application/json\n\n{\n  "slug": "invoice-order-email",\n  "data": {\n    "customer": { "first_name": "Amina" },\n    "order": {\n      "reference": "ORD-1042",\n      "paid": true,\n      "subtotal": 100,\n      "tax": 30,\n      "discount": 10,\n      "items": [{ "name": "Notebook", "price": 50, "quantity": 2 }]\n    }\n  },\n  "options": {\n    "removeSpaceBeforePunctuation": false,\n    "removeEmptyLines": false,\n    "collapseWhitespace": false\n  }\n}`,
  `200 OK\n{\n  "data": {\n    "source": "stored",\n    "templateId": 1,\n    "templateCode": "invoice-order-email",\n    "renderedSubject": "Invoice ORD-1042 - Paid",\n    "renderedHtml": "...full rendered template...",\n    "rendered": "...full rendered template..."\n  }\n}`,
  `<section class="surface"><table class="data-table"><thead><tr><th>Body field</th><th>Type</th><th>Notes</th></tr></thead><tbody><tr><td><code>id</code></td><td>number</td><td>Optional template id (stored template lookup)</td></tr><tr><td><code>slug</code></td><td>string</td><td>Optional template code (stored template lookup)</td></tr><tr><td><code>template</code></td><td>string</td><td>Inline template content when no <code>id</code>/<code>slug</code> is supplied</td></tr><tr><td><code>data</code></td><td>object</td><td>Required render data object</td></tr><tr><td><code>options</code></td><td>object</td><td>Optional render settings: <code>escapeHtml</code>, <code>removeSpaceBeforePunctuation</code>, <code>removeEmptyLines</code>, <code>collapseWhitespace</code></td></tr></tbody></table></section>`) }

${renderEndpoint('POST', '/template', 'Create template',
  'Creates a new email template for the tenant when <code>code</code>, <code>name</code>, <code>subjectTemplate</code>, and <code>htmlTemplate</code> are provided. Also supports render-preview mode when the request body contains <code>id</code>, <code>slug</code>, or <code>template</code>. Returns <code>409</code> on duplicate code.',
  `POST /template\n${REQ_HEADERS}\nContent-Type: application/json\n\n{\n  "code": "welcome-email",\n  "name": "Welcome Email",\n  "description": "Sent on registration",\n  "subjectTemplate": "Welcome, {{firstName}}!",\n  "htmlTemplate": "&lt;h1&gt;Hello {{firstName}}&lt;/h1&gt;"\n}`,
  `201 Created\n{\n  "data": {\n    "id": 1,\n    "code": "welcome-email"\n  }\n}`)}

${renderEndpoint('PUT', '/template/:code', 'Update template',
  'Updates one or more fields of an existing template. All body fields are optional; at least one must be provided. Returns <code>404</code> if the template is not found.',
  `PUT /template/welcome-email\n${REQ_HEADERS}\nContent-Type: application/json\n\n{\n  "name": "Welcome Email v2",\n  "htmlTemplate": "&lt;h1&gt;Hi {{firstName}}!&lt;/h1&gt;",\n  "isActive": true\n}`,
  `200 OK\n{\n  "data": { "success": true }\n}`,
  `<section class="surface"><table class="data-table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody><tr><td><code>name</code></td><td>string</td><td>Display name</td></tr><tr><td><code>description</code></td><td>string</td><td>Optional description</td></tr><tr><td><code>subjectTemplate</code></td><td>string</td><td>Subject line with <code>{{key}}</code> placeholders</td></tr><tr><td><code>htmlTemplate</code></td><td>string</td><td>HTML body with <code>{{key}}</code> placeholders</td></tr><tr><td><code>isActive</code></td><td>boolean</td><td><code>false</code> deactivates the template</td></tr></tbody></table></section>`)}

${renderEndpoint('DELETE', '/template/:code', 'Deactivate template',
  'Soft-deletes a template by setting <code>is_active = 0</code>. The record is retained for audit. Templates in the deactivated state are excluded from <code>POST /send/:templateCode</code> lookups. Returns <code>404</code> if not found.',
  `DELETE /template/welcome-email\n${REQ_HEADERS}`,
  `200 OK\n{\n  "data": { "success": true }\n}`)}

<h2 id="logs">Email Logs</h2>

${renderEndpoint('GET', '/logs/:tenantId/email', 'List emails',
  'Paginated email list. The <code>:tenantId</code> path segment must match the <code>X-Tenant-ID</code> header; mismatches return <code>403</code>. Supports optional query filters.',
  `GET /logs/{tenantId}/email?status=sent&page=1&pageSize=20\n${REQ_HEADERS}`,
  `200 OK\n{\n  "data": {\n    "total": 42,\n    "page": 1,\n    "pageSize": 20,\n    "items": [{\n      "id": 1,\n      "emailCode": "uuid",\n      "subject": "Hello!",\n      "status": "sent",\n      "provider": "resend",\n      "recipientCount": 1,\n      "createdAt": "2025-01-01T00:00:00Z",\n      "sentAt": "2025-01-01T00:00:01Z"\n    }]\n  }\n}`,
  `<section class="surface"><table class="data-table"><thead><tr><th>Query param</th><th>Description</th></tr></thead><tbody><tr><td><code>status</code></td><td><code>queued</code> | <code>processing</code> | <code>sent</code> | <code>failed</code> | <code>cancelled</code></td></tr><tr><td><code>templateCode</code></td><td>Filter by template code</td></tr><tr><td><code>fromDate</code></td><td>Created on or after this date (YYYY-MM-DD)</td></tr><tr><td><code>toDate</code></td><td>Created on or before this date (YYYY-MM-DD)</td></tr><tr><td><code>page</code></td><td>Page number, default <code>1</code></td></tr><tr><td><code>pageSize</code></td><td>Results per page, max <code>100</code>, default <code>20</code></td></tr></tbody></table></section>`)}

${renderEndpoint('GET', '/logs/:tenantId/email/:emailCode', 'Get email detail',
  'Returns the full email record including all recipients and audit events. The <code>:tenantId</code> path segment must match the <code>X-Tenant-ID</code> header.',
  `GET /logs/{tenantId}/email/{emailCode}\n${REQ_HEADERS}`,
  `200 OK\n{\n  "data": {\n    "id": 1,\n    "emailCode": "uuid",\n    "senderEmail": "noreply@example.com",\n    "subject": "Hello!",\n    "htmlBody": "&lt;h1&gt;Hello!&lt;/h1&gt;",\n    "status": "sent",\n    "provider": "resend",\n    "recipients": [{\n      "type": "to",\n      "emailAddress": "alice@example.com"\n    }],\n    "events": [\n      { "eventType": "created", "createdAt": "2025-01-01T00:00:00Z" },\n      { "eventType": "sent", "createdAt": "2025-01-01T00:00:01Z" }\n    ],\n    "createdAt": "2025-01-01T00:00:00Z",\n    "sentAt": "2025-01-01T00:00:01Z"\n  }\n}`)}

</main>`;
  res.type('html').send(renderPage('MagicStack Email Service', body));
});

router.get('/template-help', (_req: Request, res: Response) => {
  const helpPath = path.join(process.cwd(), '.github', 'use-template.md');
  let markdown = '';

  try {
    markdown = fs.readFileSync(helpPath, 'utf8');
  } catch {
    markdown = '# Template Help\n\nTemplate help file not found at `.github/use-template.md`.\n';
  }

  const body = `
<header class="site-header">
  <span class="base-url">${docsPath}</span>
  <h1>Template Help</h1>
  <p>Reference guide for the advanced template language and render options.</p>
</header>

<nav class="site-nav" style="margin-bottom:0;border-bottom:1px solid #e5e7eb;padding-bottom:1rem;">
  <a href="${withBasePath('/docs/send')}">Send Email</a>
  <a href="${withBasePath('/docs/templates')}">Templates</a>
  <a href="${withBasePath('/docs/logs')}">Logs</a>
  <a href="${withBasePath('/docs/template-help')}" style="font-weight:600;color:#2d7a2d;">Template Help</a>
</nav>

<main class="content-shell stack">
  <section class="doc-card">
    <div class="doc-card-header">
      <div>
        <div class="endpoint-path">${withBasePath('/docs/template-help')}</div>
        <div class="doc-card-title">use-template.md</div>
      </div>
    </div>
    <div class="doc-card-body stack">
      <pre class="code-block">${escHtml(markdown)}</pre>
    </div>
  </section>
</main>`;

  res.type('html').send(renderPage('Template Help', body));
});

export default router;
