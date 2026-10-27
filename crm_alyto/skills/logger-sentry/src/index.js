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

// Codigo por defecto segun el estado, para que un 404 no salga etiquetado como error interno.
const CODE_BY_STATUS = { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_ERROR', 503: 'SERVICE_UNAVAILABLE' };

export function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    logger.error('unhandled_error', {
      message: err.message,
      stack: err.stack,
      path: req.originalUrl,
    });
    captureException(err, { request: { method: req.method, url: req.originalUrl } });

    // Un 4xx es un fallo de la peticion: su mensaje no revela nada interno y quien llama necesita
    // leerlo. Un 5xx puede traer detalle interno (una cadena de conexion, un mensaje de la base),
    // y ese solo se muestra si el codigo lo marca con expose.
    const visible = err.expose || status < 500;

    return res.status(status).json({
      error: {
        code: err.code || CODE_BY_STATUS[status] || 'INTERNAL_ERROR',
        message: visible ? err.message : 'Error interno del servidor',
      },
    });
  };
}

export { Sentry, winston };
