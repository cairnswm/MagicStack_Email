import { randomUUID } from 'crypto';
import * as authClient from '../utils/authClient';
import { EmailAttachment, EmailImage, NormalizedRecipient, EmailRecipient } from '../types/email';

export async function resolveRecipients(
  tenantId: string,
  apiKey: string,
  hostname: string,
  recipients: EmailRecipient[],
  recipientType: 'to' | 'cc' | 'bcc',
): Promise<NormalizedRecipient[]> {
  const result: NormalizedRecipient[] = [];
  for (const r of recipients) {
    if (r.userId) {
      const user = await authClient.fetchUser(tenantId, r.userId, apiKey, hostname);
      if (user) {
        result.push({
          recipientType,
          recipientSource: 'user',
          userId: r.userId,
          emailAddress: user.email,
          displayName: user.displayName,
        });
      }
    } else if (r.email) {
      result.push({
        recipientType,
        recipientSource: 'email',
        emailAddress: r.email,
      });
    }
  }
  return result;
}

export interface CreateEmailData {
  tenantId: string;
  emailCode: string;
  templateId?: number;
  templateCode?: string;
  deliveryMode: string;
  providerName: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  htmlBody: string;
  sourceHostname: string;
  sourceApikey: string;
  status: string;
}

export async function createEmailRecord(conn: any, data: CreateEmailData): Promise<number> {
  const [result] = await conn.query(
    `INSERT INTO email (tenant_id, email_code, template_id, template_code, delivery_mode, provider_name,
     sender_name, sender_email, subject, html_body, status, source_hostname, source_apikey, queued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      data.tenantId,
      data.emailCode,
      data.templateId || null,
      data.templateCode || null,
      data.deliveryMode,
      data.providerName,
      data.senderName,
      data.senderEmail,
      data.subject,
      data.htmlBody,
      data.status,
      data.sourceHostname,
      data.sourceApikey,
    ],
  );
  return (result as any).insertId as number;
}

export async function insertRecipients(conn: any, emailId: number, recipients: NormalizedRecipient[]): Promise<void> {
  for (const r of recipients) {
    await conn.query(
      `INSERT INTO email_recipient (email_id, recipient_type, recipient_source, user_id, email_address, display_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [emailId, r.recipientType, r.recipientSource, r.userId || null, r.emailAddress, r.displayName || null],
    );
  }
}

export async function insertAttachments(conn: any, emailId: number, attachments: EmailAttachment[]): Promise<void> {
  for (const a of attachments) {
    const source = a.type === 'file' ? 'file_service' : 'upload';
    await conn.query(
      `INSERT INTO email_attachment (email_id, attachment_source, file_code, filename, content_type)
       VALUES (?, ?, ?, ?, ?)`,
      [emailId, source, a.fileCode || null, a.filename || '', a.contentType || 'application/octet-stream'],
    );
  }
}

export async function insertImages(conn: any, emailId: number, images: EmailImage[]): Promise<void> {
  for (const img of images) {
    const source = img.type === 'imaginary' ? 'imaginary' : 'upload';
    await conn.query(
      `INSERT INTO email_image (email_id, image_source, image_code, filename, content_type)
       VALUES (?, ?, ?, ?, ?)`,
      [emailId, source, img.imageCode || null, img.filename || null, img.contentType || null],
    );
  }
}

export async function insertEmailEvent(conn: any, emailId: number, eventType: string, message?: string): Promise<void> {
  await conn.query(
    `INSERT INTO email_event (email_id, event_type, event_message) VALUES (?, ?, ?)`,
    [emailId, eventType, message || null],
  );
}

export async function createQueueRecord(conn: any, emailId: number): Promise<void> {
  await conn.query(
    `INSERT INTO email_queue (email_id, status, next_attempt_at) VALUES (?, 'queued', NOW())`,
    [emailId],
  );
}

export async function updateEmailSent(conn: any, emailId: number, messageId?: string, providerResponse?: string): Promise<void> {
  await conn.query(
    `UPDATE email SET status = 'sent', sent_at = NOW(), provider_message_id = ?, provider_response = ? WHERE id = ?`,
    [messageId || null, providerResponse || null, emailId],
  );
}

export async function updateEmailFailed(conn: any, emailId: number, errorMessage: string): Promise<void> {
  await conn.query(
    `UPDATE email SET status = 'failed', failed_at = NOW(), error_message = ? WHERE id = ?`,
    [errorMessage, emailId],
  );
}

export function generateEmailCode(): string {
  return randomUUID();
}
