# Express Health API

A simple Node.js/Express API with TypeScript that provides a health check endpoint.

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the root directory:

Use example.env for the correct format

BASE_PATH should match the path as deployed on the server

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

This will:
- Compile TypeScript files to `dist/js/`
- Copy `package.json` to `dist/`
- Copy `.env` as `.env` to `dist/`
## Run Production

```bash
npm start
```

## API Endpoints

These are the initial endpoints, add and modify as required

- `GET /<serverpath>/` - Returns `{ "status": "node js app running" }`
- `GET /<serverpath>/health` - Returns `{ "status": "ok" }`
- `GET /<serverpath>/db/health` - Database health check endpoint that validates database connection
- `POST /<serverpath>/payment` - Proxies payment creation to the configured payments API
- `POST /<serverpath>/payment/webhook` - Receives payment webhook events and updates the `orders` table

### Email Send

All endpoints require `X-Tenant-ID`, `X-APIKEY`, and `X-Hostname` headers.

- `POST /<serverpath>/send` - Sends an email directly; requires `subject`, `htmlBody`, and `to` in the request body
- `POST /<serverpath>/send/:templateCode` - Sends an email using a stored template; requires `to` and `parameters` in the request body

### Template Management

- `GET /<serverpath>/template` - Lists all email templates for the tenant
- `GET /<serverpath>/template/:code` - Returns the full template record for the given code
- `POST /<serverpath>/template` - Creates a new email template; requires `code`, `name`, `subjectTemplate`, and `htmlTemplate`
- `PUT /<serverpath>/template/:code` - Updates one or more fields of an existing template
- `DELETE /<serverpath>/template/:code` - Soft-deletes a template (sets `is_active = 0`)

### Email Activity Logs

- `GET /<serverpath>/logs/:tenantId/email` - Paginated email list; supports `status`, `templateCode`, `fromDate`, `toDate`, `page`, and `pageSize` query filters
- `GET /<serverpath>/logs/:tenantId/email/:emailCode` - Full email record including recipients and events

## Payments

Set the following environment variables in `.env`:

- `PAYMENTS_API` - Base URL for the payment service
- `PAYMENTS_API_KEY` - API key used as `X-APIKEY`

The webhook payload is stored in the `orders.metadata` column for audit purposes.

## HTTP Test Files

All endpoints have corresponding [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) `.http` files in the `.http/` directory:

```
.http/
  get-health.http               # GET /health
  payments.http                 # POST /payment, POST /payment/webhook
  db/
    get-db-health.http          # GET /db/health
  property/
    get-property.http           # GET /tenant/property
    get-property-byid.http      # GET /tenant/property/:name
  send/
    post-send.http              # POST /send
    post-send-template.http     # POST /send/:templateCode
  template/
    get-templates.http          # GET /template
    get-template.http           # GET /template/:code
    post-template.http          # POST /template
    put-template.http           # PUT /template/:code
    delete-template.http        # DELETE /template/:code
  logs/
    get-email-logs.http         # GET /logs/:tenantId/email
    get-email-detail.http       # GET /logs/:tenantId/email/:emailCode
```

> **Convention:** When adding or updating API endpoints, always create or update the corresponding `.http` file in the `.http/` directory.


## Deployment

### SAetting up the server

1. Create the Directory 
2. Create an FTP user with the directory as their root 
3. <run deploy>
4. create a NodeJS application pointing to the above directory
- check the node version (20)
- run the npm start

### Deployment

``` bash
npm run deploy
```

This DOES NOT restart the app - this needs to be done manually