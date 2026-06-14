import { Router, Request, Response } from 'express';
import { errorResponse } from '../utils/formatters';

const router = Router();

// POST /send — send an email directly without a stored template.
// The tenant's API key must have the property sendByEmail set to true or 1.
router.post('/send', async (req: Request, res: Response) => {
  try {
    const tenantUtils = (req as any).tenantUtils;
    const sendByEmail = await tenantUtils.getProperty('sendByEmail');
    const allowed = sendByEmail === 'true' || sendByEmail === '1' || sendByEmail === true || sendByEmail === 1;

    if (!allowed) {
      return res.status(403).json(errorResponse('API key is not authorised to send emails. The sendByEmail property must be enabled for this tenant.'));
    }

    // TODO: implement email delivery
    return res.status(501).json(errorResponse('Email sending is not yet implemented'));
  } catch (err) {
    return res.status(500).json(errorResponse(err instanceof Error ? err.message : 'Unknown error'));
  }
});

export default router;
