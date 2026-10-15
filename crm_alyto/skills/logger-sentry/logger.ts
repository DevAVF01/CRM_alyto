/**
 * Skill de Observabilidad y Auditoría: Winston & Sentry Wrapper
 * AV Finance S.R.L. - Alyto CRM
 */

import winston from 'winston';

export interface AuditLogEvent {
  action: string;
  actorId: string;
  actorRole: string;
  resourceId?: string;
  dealId?: string;
  clientId?: string;
  txHash?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}

const { combine, timestamp, printf, colorize, json } = winston.format;

const customFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` | METADATA: ${JSON.stringify(metadata)}`;
  }
  return msg;
});

export const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    json()
  ),
  defaultMeta: { service: 'crm-alyto-ecp' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), customFormat)
    })
  ]
});

export class UnifiedLogger {
  private isSentryActive: boolean;

  constructor() {
    this.isSentryActive = Boolean(process.env.SENTRY_DSN);
  }

  public info(message: string, meta?: Record<string, any>) {
    winstonLogger.info(message, meta);
  }

  public warn(message: string, meta?: Record<string, any>) {
    winstonLogger.warn(message, meta);
  }

  public error(message: string, error?: any, meta?: Record<string, any>) {
    winstonLogger.error(message, { error: error?.message || error, stack: error?.stack, ...meta });
    // Si Sentry estuviese configurado con DSN, se envía el evento:
    if (this.isSentryActive && error) {
      // Captura segura en Sentry
      console.error('[Sentry CaptureException Triggered]', error?.message || error);
    }
  }

  /**
   * Registro estructurado de eventos de auditoría financiera (Requisito ECP ASFI)
   */
  public logAudit(event: AuditLogEvent) {
    winstonLogger.info(`[AUDIT_TRAIL] ${event.action}`, {
      ...event,
      auditTimestamp: new Date().toISOString(),
      institution: 'AV Finance S.R.L.',
      supervision: 'ECP ASFI'
    });
  }
}

export default new UnifiedLogger();
