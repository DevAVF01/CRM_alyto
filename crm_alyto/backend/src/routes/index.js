import { Router } from 'express';
import { login, me, solicitudCuenta } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDataLayer, requireScopedRead } from '../middleware/dataLayer.js';
import crmRoutes from './crm.routes.js';
import notificationsRoutes from './notifications.routes.js';

export default function routes() {
  const router = Router();

  router.post('/auth/login', login);
  router.post('/auth/solicitud', solicitudCuenta);
  router.get('/auth/me', authenticate, me);

  // El CRM entero vive bajo /crm: una sola superficie, leida y escrita con el token del usuario que
  // entro. Las direcciones antiguas (/clients, /deals, /transfers, /reports, /compliance,
  // /communications y /meta/stages) hablaban del embudo de ventas y del almacen en memoria, y se
  // fueron con el modelo del 27/10. No hay redireccion: un enlace viejo debe fallar en la cara, no
  // mostrar una pantalla que ya no existe.
  router.use('/crm', authenticate, requireScopedRead, crmRoutes);

  // Las notificaciones son el unico extremo que todavia lee del almacen de demostracion, y por eso
  // lleva el guard de modo. No toca datos del cliente: avisa, y si el conector no esta responde 502
  // diciendo cual falta.
  router.use('/notifications', authenticate, requireDataLayer, notificationsRoutes);

  return router;
}
