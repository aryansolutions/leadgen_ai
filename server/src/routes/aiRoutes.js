import { Router } from 'express';
import { tenantQuery } from '../config/database.js';
import { scoreLead, summarizeCall } from '../services/aiService.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

router.post('/leads/:leadId/score', async (request, response, next) => {
  try {
    const leadResult = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `SELECT * FROM leads WHERE id = $1 AND organization_id = $2`,
        [request.params.leadId, request.user.organization_id],
      ),
    );

    const lead = leadResult.rows[0];

    if (!lead) {
      throw new HttpError(404, 'Lead not found.');
    }

    const score = await scoreLead(lead);
    const normalizedScore = Math.min(100, Math.max(0, Number(score.score) || 0));
    const priority = ['low', 'medium', 'high'].includes(score.priority)
      ? score.priority
      : 'medium';

    await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `UPDATE leads
         SET ai_score = $1, ai_summary = $2, priority = $3, updated_at = NOW()
         WHERE id = $4 AND organization_id = $5`,
        [normalizedScore, String(score.summary || '').slice(0, 1000), priority, lead.id, request.user.organization_id],
      ),
    );

    response.json({ score: normalizedScore, priority, summary: score.summary });
  } catch (error) {
    next(error);
  }
});

router.post('/calls/:callId/summarize', async (request, response, next) => {
  try {
    const callResult = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `SELECT id, transcript
         FROM calls
         WHERE id = $1 AND organization_id = $2`,
        [request.params.callId, request.user.organization_id],
      ),
    );

    const call = callResult.rows[0];

    if (!call) {
      throw new HttpError(404, 'Call not found.');
    }

    if (!call.transcript) {
      throw new HttpError(409, 'No call transcript is available yet.');
    }

    const summary = await summarizeCall(call.transcript);

    await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `UPDATE calls
         SET ai_summary = $1, ai_sentiment = $2
         WHERE id = $3 AND organization_id = $4`,
        [
          String(summary.summary || '').slice(0, 3000),
          ['positive', 'neutral', 'negative'].includes(summary.sentiment)
            ? summary.sentiment
            : 'neutral',
          call.id,
          request.user.organization_id,
        ],
      ),
    );

    response.json({ summary });
  } catch (error) {
    next(error);
  }
});

export default router;
