import { Router, Request, Response } from 'express';

const router = Router();
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const docsPath = `${basePath}/docs`;

function withBasePath(path: string): string {
  return `${basePath}${path}` || path;
}

const ordersTableSql = `
CREATE TABLE IF NOT EXISTS orders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id     VARCHAR(100) NOT NULL,
  order_id      VARCHAR(255) NOT NULL,
  payment_id    INT          NULL,
  status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
  amount        INT          NOT NULL DEFAULT 0,
  currency      CHAR(3)      NOT NULL DEFAULT 'ZAR',
  metadata      JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order (tenant_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const paymentWebhookTableSql = `
CREATE TABLE IF NOT EXISTS payment_webhook (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id      VARCHAR(100) NULL,
  event          VARCHAR(100)  NULL,
  message        TEXT          NOT NULL,
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

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
  <a href="#setup">Setup</a>
  <a href="#send">Send</a>
  <a href="#templates">Templates</a>
  <a href="#logs">Logs</a>
  <a href="${docsPath}/payments">Payments</a>
  <a href="${withBasePath('/health')}">Health</a>
</nav>
<main class="content-shell stack">

<section class="doc-card" id="setup">
  <div class="doc-card-header">
    <div>
      <div class="endpoint-path">Tenant Setup</div>
      <div class="doc-card-title">Configure a tenant for email sending</div>
    </div>
  </div>
  <div class="doc-card-body stack">
    <div class="alert alert--info">
      <strong class="alert__title">Required headers</strong>
      <p>Every request must include <code>X-Tenant-ID</code>, <code>X-APIKEY</code>, and <code>X-Hostname</code>. Missing headers return <code>400</code>.</p>
    </div>
    <div class="two-column">
      <section class="surface">
        <h3>Tenant properties</h3>
        <p>Set the following via the Auth/Tenant Service before sending email.</p>
        <table class="data-table">
          <thead><tr><th>Property</th><th>Required</th><th>Values</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>email_provider</code></td><td>Yes</td><td><code>resend</code> | <code>sendgrid</code> | <code>smtp</code></td><td>Delivery provider</td></tr>
            <tr><td><code>email_delivery_mode</code></td><td>Yes</td><td><code>sync</code> | <code>async</code></td><td><code>sync</code> sends immediately; <code>async</code> queues</td></tr>
            <tr><td><code>sender_email</code></td><td>Yes</td><td>email address</td><td>From address shown to recipients</td></tr>
            <tr><td><code>sender_name</code></td><td>No</td><td>display name</td><td>Display name next to From address</td></tr>
            <tr><td><code>smtp_host</code></td><td>smtp only</td><td>hostname</td><td>SMTP server hostname</td></tr>
            <tr><td><code>smtp_port</code></td><td>smtp only</td><td>number</td><td>SMTP server port (e.g. 465 or 587)</td></tr>
            <tr><td><code>smtp_username</code></td><td>smtp only</td><td>email address</td><td>SMTP authentication username</td></tr>
          </tbody>
        </table>
      </section>
      <section class="surface">
        <h3>Provider secrets</h3>
        <table class="data-table">
          <thead><tr><th>Provider</th><th>Secret name</th></tr></thead>
          <tbody>
            <tr><td>Resend</td><td><code>resend_api_key</code></td></tr>
            <tr><td>SendGrid</td><td><code>sendgrid_api_key</code></td></tr>
            <tr><td>SMTP</td><td><code>smtp</code> (password)</td></tr>
          </tbody>
        </table>
        <h3>Recipient formats</h3>
        <p>Specify an email address directly, or a user ID resolved via the Auth Service.</p>
        <pre class="code-block">{ "email": "alice@example.com" }
{ "userId": "user-uuid-here" }</pre>
      </section>
    </div>
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

${renderEndpoint('POST', '/template', 'Create template',
  'Creates a new email template for the tenant. Use <code>{{key}}</code> placeholders in <code>subjectTemplate</code> and <code>htmlTemplate</code>. Returns <code>409</code> if the code already exists for this tenant.',
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

router.get('/payments', (_req: Request, res: Response) => {
  const page = renderPage('Payments Docs', `
    <header class="site-header">
      <span class="base-url">${docsPath}</span>
      <h1>Payments docs</h1>
      <p>This endpoint creates a payment and stores the initial order state. The webhook later updates the same order row to <strong>succeeded</strong> or <strong>failed</strong>.</p>
    </header>

    <nav class="site-nav">
      <a href="${withBasePath('/')}">Home</a>
      <a href="${withBasePath('/health')}">Health</a>
      <a href="${withBasePath('/payment')}">Create payment</a>
    </nav>

    <main class="content-shell">
      <section class="doc-card">
        <div class="doc-card-header">
          <span class="http-method POST">POST</span>
          <div>
            <div class="endpoint-path">/payment</div>
            <div class="doc-card-title">Create a payment</div>
          </div>
        </div>
        <div class="doc-card-body">
          <p class="doc-card-description">Send your payment creation payload here. Include an order identifier, user id, and customer email so the row can be matched later by the webhook.</p>

          <section class="surface">
            <h3>Expected request fields</h3>
            <table class="data-table">
              <thead>
                <tr><th>Field</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr><td><code>orderId</code></td><td>Required. Used as <code>orders.order_id</code>.</td></tr>
                <tr><td><code>amount</code></td><td>Required. Sent to the payment service.</td></tr>
                <tr><td><code>currency</code></td><td>Required. Example: <code>ZAR</code>.</td></tr>
                <tr><td><code>customer.email</code></td><td>Required. Passed through to the payment service.</td></tr>
                <tr><td><code>userId</code></td><td>Required. Stored in payment metadata.</td></tr>
              </tbody>
            </table>
          </section>

          <section class="surface">
            <h3>Flow</h3>
            <ol>
              <li>The API forwards the request to the configured payments service.</li>
              <li>The API stores a pending order row in the <code>orders</code> table.</li>
              <li>The webhook updates the row when payment status changes.</li>
            </ol>
          </section>

          <section class="surface">
            <h3>Webhook</h3>
            <p class="muted">Register this URL in the payment provider dashboard:</p>
            <pre class="code-block">${withBasePath('/payment/webhook')}</pre>
          </section>

          <section class="surface">
            <h3>Webhook payload shape</h3>
            <pre class="code-block">{
  "event": "charge.success",
  "data": {
    "id": 6181112847,
    "status": "success",
    "reference": "pay-...-ORDER-94-87",
    "currency": "ZAR",
    "metadata": {
      "tenantId": "tenant-uuid",
      "orderId": "ORDER-94",
      "paymentId": "87",
      "userId": "41",
      "customerEmail": "cairnswm@gmail.com"
    }
  }
}</pre>
          </section>

          <section class="surface">
            <h3>Database schema</h3>
            <pre class="code-block">${ordersTableSql.trim()}</pre>
          </section>

          <section class="surface note">
            <h3>Webhook logs table</h3>
            <p class="muted">This table stores each incoming webhook message as text for debugging.</p>
            <pre class="code-block">${paymentWebhookTableSql.trim()}</pre>
            <p class="muted">The <code>metadata</code> column stores the webhook payload for audit and debugging.</p>
          </section>
        </div>
      </section>
    </main>
  `);

  res.type('html').send(page);
});

export default router;
