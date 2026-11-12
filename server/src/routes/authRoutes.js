import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool, query } from '../config/database.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(100),
});

const loginSchema = z.object({
  organizationSlug: z.string().trim().min(2).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

function createToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'leadflow-api',
    audience: 'leadflow-client',
  });
}

function createSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return `${base || 'workspace'}-${randomUUID().slice(0, 6)}`;
}

router.post('/register', async (request, response, next) => {
  let client;
  let transactionStarted = false;

  try {
    const input = registerSchema.parse(request.body);
    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const organizationResult = await client.query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug`,
      [input.organizationName, createSlug(input.organizationName)],
    );

    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email`,
      [input.fullName, input.email, passwordHash],
    );

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [organizationResult.rows[0].id, userResult.rows[0].id],
    );

    await client.query('COMMIT');
    transactionStarted = false;

    response.status(201).json({
      token: createToken(userResult.rows[0].id),
      user: { ...userResult.rows[0], role: 'owner' },
      organization: organizationResult.rows[0],
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query('ROLLBACK');
    }

    if (error.code === '23505') {
      return next(new HttpError(409, 'An account with this email already exists.'));
    }

    next(error);
  } finally {
    client?.release();
  }
});

router.post('/login', async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const result = await query(
      `SELECT
          u.id,
          u.full_name,
          u.email,
          u.password_hash,
          o.id AS organization_id,
          o.name AS organization_name,
          o.slug AS organization_slug,
          om.role
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       JOIN organizations o ON o.id = om.organization_id
       WHERE LOWER(u.email) = $1
         AND o.slug = $2
         AND u.is_active = TRUE`,
      [input.email, input.organizationSlug],
    );

    const account = result.rows[0];
    const passwordMatches = account
      ? await bcrypt.compare(input.password, account.password_hash)
      : false;

    if (!account || !passwordMatches) {
      throw new HttpError(401, 'Email, password or workspace is incorrect.');
    }

    response.json({
      token: createToken(account.id),
      user: {
        id: account.id,
        full_name: account.full_name,
        email: account.email,
        role: account.role,
      },
      organization: {
        id: account.organization_id,
        name: account.organization_name,
        slug: account.organization_slug,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
