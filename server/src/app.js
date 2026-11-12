import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import leadFinderRoutes from './routes/leadFinderRoutes.js';
import callingRoutes from './routes/callingRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
morgan.token('safe-url', (request) => request.originalUrl.split('?')[0]);
app.use(morgan(':method :safe-url :status :response-time ms'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' },
});

app.use('/api/health', healthRoutes);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use('/api', authenticate);

app.use('/api/leads', leadRoutes);
app.use('/api/lead-finder', leadFinderRoutes);
app.use('/api/calling', callingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/campaigns', campaignRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
