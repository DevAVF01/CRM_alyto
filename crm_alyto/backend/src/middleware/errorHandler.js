import { logger } from './requestLogger.js';

export function errorHandler(err, req, res, next) {
  logger.error('Error no controlado en backend de Alyto CRM', {
    error: err.message,
    stack: err.stack,
    path: req.originalUrl
  });

  const statusCode = err.status || 500;
  res.status(statusCode).json({
    error: {
      message: err.message || 'Error interno del servidor en Alyto CRM',
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  });
}
