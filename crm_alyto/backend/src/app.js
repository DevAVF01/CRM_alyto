import express from 'express';
import cors from 'cors';
import {
  attachSentryToExpress,
  createLogger,
  errorHandler,
  initSentry,
  requestLogger,
} from 'logger-sentry';
import { supabase } from './config/supabase.js';
import routes from './routes/index.js';

export function createApp() {
  initSentry({ dsn: process.env.SENTRY_DSN });

  const app = express();
  const logger = createLogger('crm-alyto-backend');
  app.locals.logger = logger;
  app.locals.supabase = supabase;

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger(logger));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'crm-alyto-backend',
      environment: process.env.NODE_ENV || 'development',
      network: 'Stellar Testnet',
      regime: 'Entorno Controlado de Pruebas (ECP) supervisado por la ASFI',
    });
  });

  app.use('/api', routes());

  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
  });

  attachSentryToExpress(app);
  app.use(errorHandler(logger));

  return app;
}
