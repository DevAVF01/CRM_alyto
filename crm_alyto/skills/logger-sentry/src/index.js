import winston from 'winston';
import * as Sentry from '@sentry/node';

const isProduction = process.env.NODE_ENV === 'production';

export function createLogger(service = 'crm-alyto') {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: {
      service,
      environment: process.env.NODE_ENV || 'development',
    },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      isProduction
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    ),
    transports: [new winston.transports.Console()],
  });
}

let sentryEnabled = false;

export function initSentry({
  dsn,
  service = 'crm-alyto-backend',
  environment = process.env.NODE_ENV || 'development',
} = {}) {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment,
    release: process.env.APP_VERSION,
    tracesSampleRate: 0.2,
    serverName: service,
  });
  sentryEnabled = true;
  return true;
}

export function attachSentryToExpress(app) {
  if (!sentryEnabled) return;
  if (typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  }
}

export function captureException(error, context = {}) {
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([key, value]) => scope.setContext(key, value));
    Sentry.captureException(error);
  });
}

export function requestLogger(logger) {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('http_request', {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        actor: req.user?.email || 'anon',
      });
    });
    next();
  };
}

export function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    logger.error('unhandled_error', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
    });
    captureException(err, { request: { method: req.method, url: req.originalUrl } });
    return res.status(err.status || 500).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.expose ? err.message : 'Error interno del servidor',
      },
    });
  };
}

export { Sentry, winston };
