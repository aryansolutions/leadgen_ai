import { Router } from 'express';
import { tenantQuery } from '../config/database.js';

const router = Router();

router.get('/summary', async (request, response, next) => {
  try {
    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `SELECT
           (SELECT COUNT(*)::INTEGER FROM leads WHERE organization_id = $1) AS total_leads,
           (SELECT COUNT(*)::INTEGER FROM leads WHERE organization_id = $1 AND status = 'new') AS new_leads,
           (SELECT COUNT(*)::INTEGER FROM leads WHERE organization_id = $1 AND status = 'qualified') AS qualified_leads,
           (SELECT COUNT(*)::INTEGER FROM leads WHERE organization_id = $1 AND status = 'converted') AS converted_leads,
           (SELECT COUNT(*)::INTEGER FROM calls WHERE organization_id = $1 AND created_at >= NOW() - INTERVAL '30 days') AS calls_30_days,
           (SELECT COUNT(*)::INTEGER FROM calls WHERE organization_id = $1 AND status = 'completed' AND created_at >= NOW() - INTERVAL '30 days') AS completed_calls_30_days,
           (SELECT COUNT(*)::INTEGER FROM follow_ups WHERE organization_id = $1 AND status = 'pending' AND due_at <= NOW()) AS overdue_follow_ups`,
        [request.user.organization_id],
      ),
    );

    response.json({ summary: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
