import { Router, Request, Response } from 'express';
import { withConnection } from '../utils/db';
import { getTenantId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/formatters';
import { SendEmailRequest, SendTemplateEmailRequest } from '../types/email';
import {
  resolveRecipients,
  createEmailRecord,
  insertRecipients,
  insertAttachments,
  insertImages,
  insertEmailEvent,
  createQueueRecord,
  updateEmailSent,
  updateEmailFailed,
  renderTemplate,
  generateEmailCode,
} from '../services/emailService';
import { sendViaProvider, SmtpConfig } from '../providers/emailProvider';

const router = Router();

interface BaseEmailBody {
  to: SendEmailRequest['to'];
  cc?: SendEmailRequest['cc'];
  bcc?: SendEmailRequest['bcc'];
  attachments?: SendEmailRequest['attachments'];
  images?: SendEmailRequest['images'];
}

async function processSend(
  req: Request,
  res: Response,
  subject: string,
  htmlBody: string,
  body: BaseEmailBody,
  templateId?: number,
  templateCode?: string,
  renderData?: Record<string, string | number | boolean | null>,
): Promise<void> {
  const tenantId = getTenantId(req);
  const apiKey = (req as any).apiKey as string;
  const callerHostname = (req as any).callerHostname as string;
  const tenantUtils = (req as any).tenantUtils;

  const providerName = await tenantUtils.getProperty('email_provider');
  const deliveryMode = (await tenantUtils.getProperty('email_delivery_mode')) || 'sync';
  const senderName = (await tenantUtils.getProperty('sender_name')) || '';

  if (!providerName) {
    res.status(400).json(errorResponse('Tenant email_provider property is not configured'));
    return;
  }

  // For SMTP the smtp_username is the sending address; for all other providers use sender_email property
  let senderEmail: string;
  if (providerName.toLowerCase() === 'smtp') {
    const smtpUsername = await tenantUtils.getProperty('smtp_username');
    if (!smtpUsername) {
      res.status(400).json(errorResponse('Tenant smtp_username property is not configured'));
      return;
    }
    senderEmail = smtpUsername;
  } else {
    senderEmail = (await tenantUtils.getProperty('sender_email')) || '';
    if (!senderEmail) {
      res.status(400).json(errorResponse('Tenant sender_email property is not configured'));
      return;
    }
  }

  const toRecipients = await resolveRecipients(tenantId, apiKey, callerHostname, body.to, 'to');
  const ccRecipients = body.cc ? await resolveRecipients(tenantId, apiKey, callerHostname, body.cc, 'cc') : [];
  const bccRecipients = body.bcc ? await resolveRecipients(tenantId, apiKey, callerHostname, body.bcc, 'bcc') : [];
  const allRecipients = [...toRecipients, ...ccRecipients, ...bccRecipients];

  if (toRecipients.length === 0) {
    res.status(400).json(errorResponse('At least one valid to recipient is required'));
    return;
  }

  const emailCode = generateEmailCode();
  const status = deliveryMode === 'sync' ? 'processing' : 'queued';
  let emailId: number;

  try {
    emailId = await withConnection(async (conn) => {
      const id = await createEmailRecord(conn, {
        tenantId, emailCode, templateId, templateCode, deliveryMode,
        providerName, senderName, senderEmail, subject, htmlBody,
        status, sourceHostname: callerHostname, sourceApikey: apiKey,
      });
      await insertRecipients(conn, id, allRecipients);
      if (body.attachments) await insertAttachments(conn, id, body.attachments);
      if (body.images) await insertImages(conn, id, body.images);
      await insertEmailEvent(conn, id, 'created', 'Email record created');
      if (renderData) {
        await conn.query(
          `INSERT INTO email_template_render (email_id, template_code, render_data_json) VALUES (?, ?, ?)`,
          [id, templateCode, JSON.stringify(renderData)],
        );
      }
      if (deliveryMode !== 'sync') {
        await createQueueRecord(conn, id);
        await insertEmailEvent(conn, id, 'queued', 'Email added to queue');
      }
      return id;
    });
  } catch (err) {
    res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Failed to create email record'));
    return;
  }

  if (deliveryMode === 'sync') {
    try {
      let providerSecret: string | undefined;
      let smtpConfig: SmtpConfig | undefined;

      if (providerName.toLowerCase() === 'smtp') {
        const smtpHost = await tenantUtils.getProperty('smtp_host');
        const smtpPortStr = await tenantUtils.getProperty('smtp_port');

        if (!smtpHost) throw new Error('Tenant smtp_host property is not configured');
        if (!smtpPortStr) throw new Error('Tenant smtp_port property is not configured');

        providerSecret = await tenantUtils.getSecret('smtp');
        if (!providerSecret) throw new Error("Provider secret 'smtp' not found");

        smtpConfig = { host: smtpHost, port: parseInt(smtpPortStr, 10), username: senderEmail };
      } else {
        providerSecret = await tenantUtils.getSecret(`${providerName}`);
        if (!providerSecret) throw new Error(`Provider secret '${providerName} (APIKEY)' not found`);
      }

      const result = await sendViaProvider(providerName, providerSecret, {
        fromName: senderName,
        fromEmail: senderEmail,
        toAddresses: toRecipients.map(r => r.emailAddress),
        ccAddresses: ccRecipients.map(r => r.emailAddress),
        bccAddresses: bccRecipients.map(r => r.emailAddress),
        subject,
        htmlBody,
      }, smtpConfig);

      await withConnection(async (conn) => {
        await updateEmailSent(conn, emailId, result.messageId, result.providerResponse);
        await insertEmailEvent(conn, emailId, 'sent', 'Email sent successfully');
      });

      res.status(200).json(successResponse({
        emailId, emailCode, status: 'sent', provider: providerName,
        ...(templateCode ? { templateCode } : {}),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      await withConnection(async (conn) => {
        await updateEmailFailed(conn, emailId, message);
        await insertEmailEvent(conn, emailId, 'failed', message);
      }).catch(() => {});
      res.status(500).json(errorResponse(message));
    }
    return;
  }

  res.status(202).json(successResponse({
    emailId, emailCode, status: 'queued', provider: providerName,
    ...(templateCode ? { templateCode } : {}),
  }));
}

// POST /send
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as SendEmailRequest;
  if (!body.subject || !body.htmlBody || !body.to) {
    return res.status(400).json(errorResponse('subject, htmlBody, and to are required'));
  }
  return processSend(req, res, body.subject, body.htmlBody, body);
});

// POST /send/:templateCode
router.post('/:templateCode', async (req: Request, res: Response) => {
  const templateCode = req.params.templateCode;
  const tenantId = getTenantId(req);
  const body = req.body as SendTemplateEmailRequest;

  if (!body.to || !body.parameters) {
    return res.status(400).json(errorResponse('to and parameters are required'));
  }

  try {
    const rows = await withConnection(async (conn) => {
      const [result] = await conn.query(
        `SELECT id, subject_template, html_template FROM email_template WHERE tenant_id = ? AND code = ? AND is_active = 1 LIMIT 1`,
        [tenantId, templateCode],
      );
      return result as any[];
    });

    if (rows.length === 0) {
      return res.status(404).json(errorResponse(`Template '${templateCode}' not found`));
    }

    const template = rows[0];
    const subject = renderTemplate(template.subject_template as string, body.parameters);
    const htmlBody = renderTemplate(template.html_template as string, body.parameters);

    return processSend(req, res, subject, htmlBody, body, template.id as number, templateCode, body.parameters);
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

export default router;
