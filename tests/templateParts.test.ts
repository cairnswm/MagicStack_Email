import assert from 'node:assert/strict';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import * as db from '../src/utils/db';
import * as authClient from '../src/utils/authClient';
import requireEmailAdmin from '../src/middleware/requireEmailAdmin';
import templatePartsRouter from '../src/routes/templateParts';
import templateRouter from '../src/routes/template';

type Part = {
  id: number;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  content_template: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

test('template parts are managed per tenant and rendered only while active', async () => {
  const parts: Part[] = [];
  const connection = {
    async query(sql: string, values: (string | number | null)[]) {
      if (sql.includes('INSERT INTO email_template_part')) {
        const [tenantId, code, name, description, content] = values as [string, string, string, string | null, string];
        if (parts.some(part => part.tenant_id === tenantId && part.code === code)) {
          throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        }
        parts.push({
          id: parts.length + 1, tenant_id: tenantId, code, name, description,
          content_template: content, is_active: 1, created_at: new Date(), updated_at: new Date(),
        });
        return [{ insertId: parts.length }];
      }
      if (sql.includes('UPDATE email_template_part')) {
        const tenantId = values[values.length - 2];
        const code = values[values.length - 1];
        const part = parts.find(row => row.tenant_id === tenantId && row.code === code);
        if (!part) return [{ affectedRows: 0 }];
        if (sql.includes('SET is_active = 0')) {
          part.is_active = 0;
        } else {
          const columns = sql.split(' SET ')[1].split(' WHERE ')[0].split(', ');
          for (const [index, column] of columns.entries()) {
            const value = values[index];
            switch (column) {
              case 'name = ?': part.name = String(value); break;
              case 'description = ?': part.description = value === null ? null : String(value); break;
              case 'content_template = ?': part.content_template = String(value); break;
              case 'is_active = ?': part.is_active = Number(value); break;
              default: throw new Error(`Unexpected column: ${column}`);
            }
          }
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM email_template_part')) {
        const [tenantId, code] = values;
        const rows = parts.filter(part => part.tenant_id === tenantId &&
          (code === undefined || part.code === code) &&
          (!sql.includes('is_active = 1') || part.is_active === 1));
        return [rows];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const originalWithConnection = db.withConnection;
  const originalValidateToken = authClient.validateToken;
  Object.defineProperty(db, 'withConnection', { configurable: true, value: async (fn: (conn: typeof connection) => Promise<unknown>) => fn(connection) });
  Object.defineProperty(authClient, 'validateToken', { configurable: true, value: async () => ({}) });

  const app = express();
  app.use(express.json());
  app.use('/template-parts', requireEmailAdmin, templatePartsRouter);
  app.use('/template', requireEmailAdmin, templateRouter);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = (role: string) => `Bearer x.${Buffer.from(JSON.stringify({ roles: [role] })).toString('base64url')}.x`;
  const request = async (path: string, method = 'GET', body?: unknown, tenant = 'tenant-a', authorization = token('Admin')) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json', 'X-Tenant-ID': tenant, 'X-APIKEY': 'key',
        'X-Hostname': 'localhost', ...(authorization ? { Authorization: authorization } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseBody = await response.json() as {
      data: { code: string; rendered: string; isActive: boolean; parts: { isActive: boolean }[] };
    };
    return { status: response.status, body: responseBody };
  };

  try {
    assert.equal((await request('/template-parts', 'GET', undefined, 'tenant-a', '')).status, 401);
    assert.equal((await request('/template-parts', 'GET', undefined, 'tenant-a', token('User'))).status, 403);
    assert.equal((await request('/template-parts', 'POST', { code: 'bad code', name: 'Header', contentTemplate: '' })).status, 400);
    assert.equal((await request('/template-parts', 'POST', { code: '..', name: 'Header', contentTemplate: '' })).status, 400);
    assert.equal((await request('/template-parts', 'POST', { code: 'header', name: 'Header', contentTemplate: 42 })).status, 400);
    const created = await request('/template-parts', 'POST', {
      code: 'header', name: 'Header', contentTemplate: '<p>Hello {{customer}}</p>',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.code, 'header');
    assert.equal((await request('/template-parts', 'POST', { code: 'header', name: 'Duplicate', contentTemplate: '' })).status, 409);
    assert.equal((await request('/template-parts/header', 'GET', undefined, 'tenant-b')).status, 404);
    assert.equal((await request('/template-parts/header', 'PUT', { name: 'Other' }, 'tenant-b')).status, 404);
    assert.equal((await request('/template-parts/header', 'DELETE', undefined, 'tenant-b')).status, 404);
    assert.equal((await request('/template-parts', 'POST', { code: 'header', name: 'Other', contentTemplate: 'other' }, 'tenant-b')).status, 201);

    const preview = () => request('/template/render', 'POST', { template: '{{part.header}}', data: { customer: 'Amina' } });
    assert.equal((await preview()).body.data.rendered, '<p>Hello Amina</p>');
    assert.equal((await request('/template-parts/header', 'PUT', { isActive: 'false' })).status, 400);
    assert.equal((await request('/template-parts/header', 'PUT', {})).status, 400);
    assert.equal((await request('/template-parts/header', 'PUT', { contentTemplate: 'Welcome {{customer}}', description: null })).status, 200);
    assert.equal((await preview()).body.data.rendered, 'Welcome Amina');
    assert.equal((await request('/template-parts/header', 'DELETE')).status, 200);
    assert.equal((await preview()).body.data.rendered, '');
    assert.equal((await request('/template-parts')).body.data.parts[0].isActive, false);
    assert.equal((await request('/template-parts/header')).body.data.isActive, false);
    assert.equal((await request('/template-parts/header', 'PUT', { isActive: true })).status, 200);
    assert.equal((await preview()).body.data.rendered, 'Welcome Amina');
    assert.equal((await request('/template-parts', 'POST', { code: '__proto__', name: 'Special', contentTemplate: 'safe' })).status, 201);
    const specialPreview = () => request('/template/render', 'POST', { template: '{{part.__proto__}}', data: {} });
    assert.equal((await specialPreview()).body.data.rendered, 'safe');
    assert.equal((await request('/template-parts/__proto__', 'DELETE')).status, 200);
    assert.equal((await specialPreview()).body.data.rendered, '');
    assert.equal((await request('/template/render', 'POST', { template: '{{part.constructor}}', data: {} })).body.data.rendered, '');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    Object.defineProperty(db, 'withConnection', { configurable: true, value: originalWithConnection });
    Object.defineProperty(authClient, 'validateToken', { configurable: true, value: originalValidateToken });
  }
});
