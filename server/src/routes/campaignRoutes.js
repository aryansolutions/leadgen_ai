import { Router } from 'express';
import { z } from 'zod';
import { tenantQuery } from '../config/database.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().max(3000).optional().default(''),
});

router.get('/', async (request, response, next) => {
  try {
    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `SELECT c.*, COUNT(cl.lead_id)::INTEGER AS lead_count
         FROM campaigns c
         LEFT JOIN campaign_leads cl
           ON cl.campaign_id = c.id AND cl.organization_id = c.organization_id
         WHERE c.organization_id = $1
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [request.user.organization_id],
      ),
    );

    response.json({ campaigns: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (request, response, next) => {
  try {
    const input = campaignSchema.parse(request.body);
    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `INSERT INTO campaigns (organization_id, name, description, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [request.user.organization_id, input.name, input.description, request.user.user_id],
      ),
    );

    response.status(201).json({ campaign: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/:campaignId/leads', async (request, response, next) => {
  try {
    const leadIds = z.array(z.string().uuid()).min(1).max(500).parse(request.body.leadIds);

    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      async (client) => {
        const campaign = await client.query(
          'SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2',
          [request.params.campaignId, request.user.organization_id],
        );

        if (!campaign.rowCount) {
          throw new HttpError(404, 'Campaign not found.');
        }

        let added = 0;

        for (const leadId of leadIds) {
          const inserted = await client.query(
            `INSERT INTO campaign_leads (organization_id, campaign_id, lead_id)
             SELECT $1, $2, id FROM leads
             WHERE id = $3 AND organization_id = $1
             ON CONFLICT DO NOTHING`,
            [request.user.organization_id, request.params.campaignId, leadId],
          );
          added += inserted.rowCount;
        }

        return added;
      },
    );

    response.json({ added: result });
  } catch (error) {
    next(error);
  }
});

export default router;
