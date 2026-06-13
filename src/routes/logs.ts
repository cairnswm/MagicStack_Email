import { Router, Request, Response } from 'express';
import { withConnection } from '../utils/db';
import { getTenantId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/formatters';

const router = Router();

// GET /logs/:tenantId/email - paginated email list
router.get('/:tenantId/email', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId;
    const headerTenantId = getTenantId(req);
    if (tenantId !== headerTenantId) {
      return res.status(403).json(errorResponse('Access denied: tenant mismatch'));
    }

    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize as string) || '20', 10)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['e.tenant_id = ?'];
    const params: any[] = [tenantId];

    if (req.query.status) { conditions.push('e.status = ?'); params.push(req.query.status); }
    if (req.query.templateCode) { conditions.push('e.template_code = ?'); params.push(req.query.templateCode); }
    if (req.query.fromDate) { conditions.push('e.created_at >= ?'); params.push(req.query.fromDate); }
    if (req.query.toDate) { conditions.push('e.created_at <= ?'); params.push(req.query.toDate); }

    const where = conditions.join(' AND ');

    const [countRows, emailRows] = await withConnection(async (conn) => {
      const [cr] = await conn.query(
        `SELECT COUNT(*) as total FROM email e WHERE ${where}`,
        params,
      );
      const [er] = await conn.query(
        `SELECT e.id, e.email_code, e.template_code, e.subject, e.status, e.provider_name,
                COUNT(er.id) AS recipient_count, e.created_at, e.sent_at
         FROM email e
         LEFT JOIN email_recipient er ON er.email_id = e.id
         WHERE ${where}
         GROUP BY e.id
         ORDER BY e.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      );
      return [cr as any[], er as any[]];
    });

    const total = (countRows[0]?.total as number) || 0;

    return res.json(successResponse({
      total,
      page,
      pageSize,
      items: emailRows.map(r => ({
        id: r.id as number,
        emailCode: r.email_code as string,
        templateCode: (r.template_code as string) || undefined,
        subject: r.subject as string,
        status: r.status as string,
        provider: r.provider_name as string,
        recipientCount: Number(r.recipient_count),
        createdAt: r.created_at as string,
        sentAt: (r.sent_at as string) || undefined,
      })),
    }));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

// GET /logs/:tenantId/email/:emailCode - full email details
router.get('/:tenantId/email/:emailCode', async (req: Request, res: Response) => {
  try {
    const tenantId = req.params.tenantId;
    const emailCode = req.params.emailCode;
    const headerTenantId = getTenantId(req);
    if (tenantId !== headerTenantId) {
      return res.status(403).json(errorResponse('Access denied: tenant mismatch'));
    }

    const result = await withConnection(async (conn) => {
      const [emailRows] = await conn.query(
        `SELECT id, email_code, template_code, sender_name, sender_email, subject, html_body,
                status, provider_name, provider_message_id, error_message, created_at, sent_at
         FROM email WHERE tenant_id = ? AND email_code = ? LIMIT 1`,
        [tenantId, emailCode],
      );
      const emails = emailRows as any[];
      if (emails.length === 0) return null;

      const email = emails[0];

      const [recipientRows] = await conn.query(
        `SELECT recipient_type, email_address, user_id FROM email_recipient WHERE email_id = ?`,
        [email.id],
      );

      const [eventRows] = await conn.query(
        `SELECT event_type, event_message, created_at FROM email_event WHERE email_id = ? ORDER BY created_at ASC`,
        [email.id],
      );

      return { email, recipients: recipientRows as any[], events: eventRows as any[] };
    });

    if (!result) {
      return res.status(404).json(errorResponse(`Email '${emailCode}' not found`));
    }

    const { email, recipients, events } = result;
    return res.json(successResponse({
      id: email.id as number,
      emailCode: email.email_code as string,
      templateCode: (email.template_code as string) || undefined,
      senderName: email.sender_name as string,
      senderEmail: email.sender_email as string,
      subject: email.subject as string,
      htmlBody: email.html_body as string,
      status: email.status as string,
      provider: email.provider_name as string,
      providerMessageId: (email.provider_message_id as string) || undefined,
      errorMessage: (email.error_message as string) || undefined,
      recipients: (recipients as any[]).map(r => ({
        type: r.recipient_type as string,
        emailAddress: r.email_address as string,
        userId: (r.user_id as string) || undefined,
      })),
      events: (events as any[]).map(e => ({
        eventType: e.event_type as string,
        eventMessage: (e.event_message as string) || undefined,
        createdAt: e.created_at as string,
      })),
      createdAt: email.created_at as string,
      sentAt: (email.sent_at as string) || undefined,
    }));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

export default router;
