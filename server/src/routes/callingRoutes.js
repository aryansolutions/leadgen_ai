
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { tenantQuery } from '../config/database.js';
import { env } from '../config/env.js';
import { startAiCall } from '../services/exotelService.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

const callStartLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'Call initiation limit reached. Try again in a minute.',
  },
});

router.get('/', async (request, response, next) => {
  try {
    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) =>
        client.query(
          `SELECT
              c.*,
              l.first_name,
              l.last_name,
              l.phone,
              u.full_name AS agent_name
           FROM calls c
           JOIN leads l
             ON l.id = c.lead_id
            AND l.organization_id = c.organization_id
           LEFT JOIN organization_members om
             ON om.organization_id = c.organization_id
            AND om.user_id = c.agent_id
           LEFT JOIN users u ON u.id = om.user_id
           WHERE c.organization_id = $1
           ORDER BY c.created_at DESC
           LIMIT 100`,
          [request.user.organization_id],
        ),
    );

    response.json({ calls: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/start/:leadId',
  callStartLimiter,
  async (request, response, next) => {
    try {
      if (!env.CALLING_ENABLED) {
        throw new HttpError(
          503,
          'Calling is currently disabled by the server administrator.',
        );
      }

      if (!env.PUBLIC_API_URL.startsWith('https://')) {
        throw new HttpError(
          503,
          'A public HTTPS API URL is required for AI voice streaming.',
        );
      }

      if (!env.EXOTEL_WEBHOOK_SECRET) {
        throw new HttpError(
          503,
          'Configure EXOTEL_WEBHOOK_SECRET before enabling calling.',
        );
      }

      const leadResult = await tenantQuery(
        request.user.organization_id,
        request.user.user_id,
        (client) =>
          client.query(
            `SELECT id, phone, status
             FROM leads
             WHERE id = $1 AND organization_id = $2`,
            [request.params.leadId, request.user.organization_id],
          ),
      );

      const lead = leadResult.rows[0];

      if (!lead) {
        throw new HttpError(404, 'Lead not found.');
      }

      if (!lead.phone) {
        throw new HttpError(400, 'This lead does not have a phone number.');
      }

      if (lead.status === 'do_not_call') {
        throw new HttpError(
          409,
          'This lead is on the do-not-call list.',
        );
      }

      // Require documented consent for AI voice calls.
      const consentResult = await tenantQuery(
        request.user.organization_id,
        request.user.user_id,
        (client) =>
          client.query(
            `SELECT consent_status
             FROM consent_records
             WHERE organization_id = $1
               AND lead_id = $2
               AND purpose = 'ai_voice_call'
             ORDER BY recorded_at DESC
             LIMIT 1`,
            [request.user.organization_id, lead.id],
          ),
      );

      if (
        !consentResult.rowCount ||
        consentResult.rows[0].consent_status !== 'granted'
      ) {
        throw new HttpError(
          403,
          'Documented consent for AI voice calls is required before dialing this lead.',
        );
      }

      // Create the internal call record.
      const callResult = await tenantQuery(
        request.user.organization_id,
        request.user.user_id,
        (client) =>
          client.query(
            `INSERT INTO calls (
               organization_id,
               lead_id,
               agent_id,
               status
             )
             VALUES ($1, $2, $3, 'initiated')
             RETURNING id`,
            [
              request.user.organization_id,
              lead.id,
              request.user.user_id,
            ],
          ),
      );

      const callId = callResult.rows[0].id;

      // Create a short-lived token for the media WebSocket.
      const streamToken = jwt.sign(
        {
          purpose: 'exotel-media',
          callId,
          organizationId: request.user.organization_id,
          userId: request.user.user_id,
        },
        env.JWT_SECRET,
        {
          expiresIn: '15m',
          issuer: 'leadflow-api',
          audience: 'leadflow-media',
        },
      );

      const streamUrlUrl = new URL('/media', env.PUBLIC_API_URL);
      streamUrlUrl.protocol = 'wss:';
      streamUrlUrl.searchParams.set('token', streamToken);
      streamUrlUrl.searchParams.set('sample-rate', '8000');

      const webhookUrl = new URL(
        `/api/webhooks/exotel/${request.user.organization_id}/${callId}`,
        env.PUBLIC_API_URL,
      );

      webhookUrl.searchParams.set(
        'token',
        env.EXOTEL_WEBHOOK_SECRET,
      );

      // Initiate the provider call.
      let providerResult;

      try {
        providerResult = await startAiCall({
          customerPhone: lead.phone,
          streamUrl: streamUrlUrl.toString(),
          statusCallback: webhookUrl.toString(),
        });
      } catch (error) {
        await tenantQuery(
          request.user.organization_id,
          request.user.user_id,
          (client) =>
            client.query(
              `UPDATE calls
               SET status = 'failed',
                   ended_at = NOW()
               WHERE id = $1
                 AND organization_id = $2`,
              [callId, request.user.organization_id],
            ),
        );

        throw error;
      }

      // The provider has accepted the call. Do not mark it failed
      // or invite a retry if this subsequent database update fails.
      try {
        await tenantQuery(
          request.user.organization_id,
          request.user.user_id,
          (client) =>
            client.query(
              `UPDATE calls
               SET provider_call_id = $1,
                   status = CASE
                     WHEN status = 'initiated' THEN 'ringing'
                     ELSE status
                   END
               WHERE id = $2
                 AND organization_id = $3`,
              [
                providerResult.providerCallId,
                callId,
                request.user.organization_id,
              ],
            ),
        );
      } catch (error) {
        console.error(
          'Provider accepted call, but saving its ID failed:',
          { callId, error: error.message },
        );
      }

      response.status(202).json({
        callId,
        providerCallId: providerResult.providerCallId,
        message: 'AI call request accepted by the calling provider.',
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
