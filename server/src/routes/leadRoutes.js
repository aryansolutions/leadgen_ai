import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { tenantQuery } from '../config/database.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const leadSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional().default(''),
  company: z.string().trim().max(180).optional().default(''),
  email: z.string().trim().email().optional().or(z.literal('')).default(''),
  phone: z.string().trim().min(8).max(32),
  source: z.string().trim().max(80).optional().default('manual'),
  status: z.enum([
    'new', 'contacted', 'qualified', 'interested', 'converted',
    'not_interested', 'invalid', 'do_not_call',
  ]).optional().default('new'),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  notes: z.string().max(5000).optional().default(''),
});

function normalizePhone(phone) {
  return phone.replace(/[\s().-]/g, '');
}

router.get('/', async (request, response, next) => {
  try {
    const search = String(request.query.search || '').trim();
    const status = String(request.query.status || '').trim();
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
    const offset = (page - 1) * limit;

    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `SELECT
            l.*,
            u.full_name AS assigned_name
         FROM leads l
         LEFT JOIN organization_members om
           ON om.organization_id = l.organization_id
          AND om.user_id = l.assigned_to
         LEFT JOIN users u ON u.id = om.user_id
         WHERE l.organization_id = $1
           AND ($2 = '' OR l.status = $2)
           AND (
             $3 = '' OR
             CONCAT_WS(' ', l.first_name, l.last_name, l.company, l.email, l.phone)
               ILIKE '%' || $3 || '%'
           )
         ORDER BY l.created_at DESC
         LIMIT $4 OFFSET $5`,
        [request.user.organization_id, status, search, limit, offset],
      ),
    );

    response.json({ leads: result.rows, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (request, response, next) => {
  try {
    const input = leadSchema.parse(request.body);
    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      async (client) => {
        const lead = await client.query(
          `INSERT INTO leads (
             organization_id, first_name, last_name, company, email,
             phone, phone_normalized, source, status, priority, notes
           )
           VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            request.user.organization_id,
            input.firstName,
            input.lastName,
            input.company,
            input.email,
            input.phone,
            normalizePhone(input.phone),
            input.source,
            input.status,
            input.priority,
            input.notes,
          ],
        );

        await client.query(
          `INSERT INTO activities (organization_id, lead_id, user_id, activity_type, description)
           VALUES ($1, $2, $3, 'lead_created', 'Lead created')`,
          [request.user.organization_id, lead.rows[0].id, request.user.user_id],
        );

        return lead;
      },
    );

    response.status(201).json({ lead: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new HttpError(409, 'A lead with this phone number already exists.'));
    }

    next(error);
  }
});

router.patch('/:id', async (request, response, next) => {
  try {
    const input = leadSchema.partial().parse(request.body);
    const allowedColumns = {
      firstName: 'first_name',
      lastName: 'last_name',
      company: 'company',
      email: 'email',
      phone: 'phone',
      source: 'source',
      status: 'status',
      priority: 'priority',
      notes: 'notes',
    };

    const updates = Object.entries(input).filter(([key]) => allowedColumns[key]);

    if (updates.length === 0) {
      throw new HttpError(400, 'Provide at least one field to update.');
    }

    const values = [request.params.id, request.user.organization_id];
    const assignments = updates.map(([key, value]) => {
      values.push(key === 'phone' ? normalizePhone(value) : value);

      const column = key === 'phone'
        ? 'phone_normalized'
        : allowedColumns[key];

      return `${column} = $${values.length}`;
    });

    const phoneUpdate = updates.find(([key]) => key === 'phone');
    if (phoneUpdate) {
      values.push(phoneUpdate[1]);
      assignments.push(`phone = $${values.length}`);
    }

    values.push(new Date());
    assignments.push(`updated_at = $${values.length}`);

    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        `UPDATE leads
         SET ${assignments.join(', ')}
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        values,
      ),
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Lead not found.');
    }

    response.json({ lead: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (request, response, next) => {
  try {
    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      (client) => client.query(
        'DELETE FROM leads WHERE id = $1 AND organization_id = $2 RETURNING id',
        [request.params.id, request.user.organization_id],
      ),
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, 'Lead not found.');
    }

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.post('/import', upload.single('file'), async (request, response, next) => {
  try {
    if (!request.file) {
      throw new HttpError(400, 'Choose a CSV file to import.');
    }

    const records = parse(request.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: false,
    });

    if (records.length > 5000) {
      throw new HttpError(400, 'Import up to 5,000 leads per file.');
    }

    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      async (client) => {
        let imported = 0;
        let skipped = 0;

        for (const row of records) {
          const input = leadSchema.safeParse({
            firstName: row.firstName || row.first_name || row.name || '',
            lastName: row.lastName || row.last_name || '',
            company: row.company || '',
            email: row.email || '',
            phone: row.phone || row.mobile || '',
            source: row.source || 'csv_import',
            status: 'new',
            priority: 'medium',
            notes: row.notes || '',
          });

          if (!input.success) {
            skipped += 1;
            continue;
          }

          const lead = input.data;
          const inserted = await client.query(
            `INSERT INTO leads (
               organization_id, first_name, last_name, company, email,
               phone, phone_normalized, source, status, priority, notes
             )
             VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10, $11)
             ON CONFLICT (organization_id, phone_normalized) DO NOTHING
             RETURNING id`,
            [
              request.user.organization_id,
              lead.firstName,
              lead.lastName,
              lead.company,
              lead.email,
              lead.phone,
              normalizePhone(lead.phone),
              lead.source,
              lead.status,
              lead.priority,
              lead.notes,
            ],
          );

          if (inserted.rowCount) imported += 1;
          else skipped += 1;
        }

        return { imported, skipped, total: records.length };
      },
    );

    response.json(result);
  } catch (error) {
    next(error);
  }
});



router.post('/:id/consent', async (request, response, next) => {
  try {
    const input = z.object({
      purpose: z.enum(['ai_voice_call', 'marketing_call']),
      consentStatus: z.enum([
        'granted',
        'withdrawn',
        'unknown',
        'not_required',
      ]),
      source: z.string().trim().min(1).max(100).default('manual'),
      evidenceReference: z.string().trim().max(1000).optional().default(''),
    }).parse(request.body);

    if (
      input.consentStatus === 'granted' &&
      !input.evidenceReference
    ) {
      throw new HttpError(
        400,
        'Evidence reference is required when recording granted consent.',
      );
    }

    const result = await tenantQuery(
      request.user.organization_id,
      request.user.user_id,
      async (client) => {
        const lead = await client.query(
          `SELECT id
           FROM leads
           WHERE id = $1 AND organization_id = $2`,
          [request.params.id, request.user.organization_id],
        );

        if (!lead.rowCount) {
          throw new HttpError(404, 'Lead not found.');
        }

        const consent = await client.query(
          `INSERT INTO consent_records (
             organization_id,
             lead_id,
             purpose,
             consent_status,
             source,
             evidence_reference
           )
           VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
           RETURNING *`,
          [
            request.user.organization_id,
            request.params.id,
            input.purpose,
            input.consentStatus,
            input.source,
            input.evidenceReference,
          ],
        );

        return consent;
      },
    );

    response.status(201).json({
      consent: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
});


export default router;
