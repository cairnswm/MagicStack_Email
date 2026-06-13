import { Router, Request, Response } from 'express';

const router = Router();
const basePath = (process.env.BASE_PATH || '').replace(/\/$/, '');
const docsPath = `${basePath}/docs`;

function withBasePath(path: string) {
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

function renderPage(title: string, body: string) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <link rel="stylesheet" href="https://cdn.runeworkz.com/styles.css" />
      </head>
      <body class="app-shell">
        ${body}
      </body>
    </html>
  `;
}

router.get('/', (_req: Request, res: Response) => {
  const page = renderPage('MagicStack API Help', `
    <header class="site-header">
      <span class="base-url">${basePath || '/'}</span>
      <h1>MagicStack API</h1>
      <p>Node.js and Express API template with tenant-aware routes, health checks, and payment integration.</p>
    </header>

    <nav class="site-nav">
      <a href="${withBasePath('/health')}">Health</a>
      <a href="${withBasePath('/db/health')}">Database</a>
      <a href="${docsPath}/payments">Payments docs</a>
    </nav>

    <main class="content-shell">
      <section class="doc-card">
        <div class="doc-card-header">
          <span class="http-method GET">GET</span>
          <div>
            <div class="endpoint-path">/</div>
            <div class="doc-card-title">Service help</div>
          </div>
        </div>
        <div class="doc-card-body">
          <p class="doc-card-description">This API template includes tenant-aware routes, health checks, and payment integration.</p>

          <div class="cols">
            <section class="surface">
              <h3>Core routes</h3>
              <ul>
                <li><code>GET /health</code></li>
                <li><code>GET /db/health</code></li>
                <li><code>GET /tenant/*</code></li>
                <li><code>GET /*</code></li>
              </ul>
            </section>
            <section class="surface">
              <h3>Payments</h3>
              <ul>
                <li><code>POST /payment</code></li>
                <li><code>POST /payment/webhook</code></li>
                <li><code>GET ${docsPath}/payments</code></li>
              </ul>
            </section>
          </div>

          <section class="surface">
            <h3>Required environment variables</h3>
            <pre class="code-block">PAYMENTS_API=https://payments.example.com
PAYMENTS_API_KEY=your-api-key</pre>
          </section>

          <section class="surface note">
            <h3>Webhook registration URL</h3>
            <pre class="code-block">${withBasePath('/payment/webhook')}</pre>
            <p class="muted">For detailed payment setup instructions and schema, open <a href="${docsPath}/payments">the payments docs</a>.</p>
          </section>
        </div>
      </section>
    </main>
  `);

  res.type('html').send(page);
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
