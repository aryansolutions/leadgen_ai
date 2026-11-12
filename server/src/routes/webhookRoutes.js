
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { tenantQuery } from '../config/database.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const callStatusMap = {
  completed: 'completed',
  failed: 'failed',
  busy: 'busy',
  'no-answer': 'no_answer',
  no_answer: 'no_answer',
  cancelled: 'cancelled',
};

function secretsMatch(received, expected) {
  if (
    typeof received !== 'string' ||
    typeof expected !== 'string' ||
    !received ||
    !expected
  ) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function parseDuration(value) {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const input = String(value);

  if (/^\d+$/.test(input)) {
    return Number(input);
  }

  const parts = input.split(':').map(Number);

  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return 0;
}

function getRecordingUrl(payload) {
  const value = payload.RecordingUrl || payload.recording_url || '';

  if (!value) return null;

  try {
    const url = new URL(value);

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

router.post(
  '/exotel/:organizationId/:callId',
  async (request, response, next) => {
    try {
      if (!secretsMatch(request.query.token, env.EXOTEL_WEBHOOK_SECRET)) {
        throw new HttpError(401, 'Invalid webhook token.');
      }

      const { organizationId, callId } = request.params;

      if (
        !UUID_PATTERN.test(organizationId) ||
        !UUID_PATTERN.test(callId)
      ) {
        throw new HttpError(400, 'Invalid callback identifiers.');
      }

      const payload = request.body || {};

      const providerCallId = String(
        payload.CallSid || payload.call_sid || payload.Sid || '',
      ).trim();

      const providerStatus = String(
        payload.Status || payload.status || '',
      ).trim().toLowerCase();

      const normalizedStatus = callStatusMap[providerStatus];

      if (!providerCallId) {
        throw new HttpError(400, 'Missing provider call identifier.');
      }

      if (!normalizedStatus) {
        return response.status(200).json({
          received: true,
          ignored: true,
        });
      }

      const eventKey = [
        callId,
        providerCallId,
        providerStatus,
        payload.DateUpdated || '',
      ].join(':');

      const result = await tenantQuery(
        organizationId,
        SYSTEM_USER_ID,
        async (client) => {
          // Register event within the current organization.
          const inserted = await client.query(
            `INSERT INTO webhook_events (
               organization_id,
               provider,
               provider_event_id,
               event_type,
               payload
             )
             VALUES ($1, 'exotel', $2, $3, $4::jsonb)
             ON CONFLICT (
               organization_id,
               provider,
               provider_event_id
             ) DO NOTHING
             RETURNING id`,
            [
              organizationId,
              eventKey,
              providerStatus,
              JSON.stringify(payload),
            ],
          );

          if (!inserted.rowCount) {
            return { duplicate: true };
          }

          // Update the call belonging to this organization.
          const updatedCall = await client.query(
            `UPDATE calls
             SET status = $1,
                 recording_url = COALESCE($2, recording_url),
                 ended_at = COALESCE(ended_at, NOW()),
                 duration_seconds = GREATEST(duration_seconds, $3)
             WHERE id = $4
               AND organization_id = $5
               AND provider_call_id = $6
             RETURNING id, lead_id`,
            [
              normalizedStatus,
              getRecordingUrl(payload),
              parseDuration(payload.Duration || payload.duration),
              callId,
              organizationId,
              providerCallId,
            ],
          );

          if (!updatedCall.rowCount) {
            throw new HttpError(
              404,
              'Call record was not found for this callback.',
            );
          }

          // Update the associated lead.
          await client.query(
            `UPDATE leads
             SET last_contacted_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1
               AND organization_id = $2`,
            [
              updatedCall.rows[0].lead_id,
              organizationId,
            ],
          );

          // Mark only this organization's event as processed.
          await client.query(
            `UPDATE webhook_events
             SET processed_at = NOW()
             WHERE organization_id = $1
               AND provider = 'exotel'
               AND provider_event_id = $2`,
            [organizationId, eventKey],
          );

          return { processed: true };
        },
      );

      if (result.duplicate) {
        return response.status(200).json({
          received: true,
          duplicate: true,
        });
      }

      return response.status(200).json({
        received: true,
        processed: true,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
