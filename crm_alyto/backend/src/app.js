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
import { runtimeStatus } from './config/runtime.js';
import routes from './routes/index.js';

export function createApp() {
  initSentry({ dsn: process.env.SENTRY_DSN });

  const app = express();
  const logger = createLogger('crm-alyto-backend');
  app.locals.logger = logger;
  app.locals.supabase = supabase;

  app.use(cors());
  // La subida del legajo (F-18) lleva el archivo en base64: el parser global se queda en 1 MB y
  // la ruta del documento levanta el suyo en 14 MB. Sin este salto, el cuerpo grande muere aqui.
  app.use((req, res, next) => {
    if (req.method === 'POST' && /^\/api\/crm\/fichas\/[\w-]+\/documentos$/.test(req.path)) return next();
    return express.json({ limit: '1mb' })(req, res, next);
  });
  app.use(requestLogger(logger));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'crm-alyto-backend',
      environment: process.env.NODE_ENV || 'development',
      regime: 'Entorno Controlado de Pruebas (ECP) supervisado por la ASFI',
      runtime: runtimeStatus(),
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
