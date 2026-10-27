import { Router } from 'express';
import { login, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { requireDataLayer, requireScopedRead } from '../middleware/dataLayer.js';
import { store } from '../data/store.js';
import clientRoutes from './clients.routes.js';
import messagingRoutes from './messaging.routes.js';
import transferRoutes from './transfers.routes.js';
import dealRoutes from './deals.routes.js';
import complianceRoutes from './compliance.routes.js';
import communicationsRoutes from './communications.routes.js';
import reportsRoutes from './reports.routes.js';
import notificationsRoutes from './notifications.routes.js';

export default function routes() {
  const router = Router();

  router.post('/auth/login', login);
  router.get('/auth/me', authenticate, me);
  router.get('/meta/stages', authenticate, requireDataLayer, (req, res) => res.json({ data: store.stages }));

  const dataRoutes = [authenticate, requireDataLayer];

  // Las lecturas del CRM de mensajeria no pasan por requireDataLayer: no tienen version en
  // memoria, y mezclarlas con los datos de demostracion seria peor que un 503.
  router.use('/messaging', authenticate, requireScopedRead, messagingRoutes);

  router.use('/clients', ...dataRoutes, clientRoutes);
  router.use('/transfers', ...dataRoutes, transferRoutes);
  router.use('/deals', ...dataRoutes, dealRoutes);
  router.use('/compliance', ...dataRoutes, complianceRoutes);
  router.use('/communications', ...dataRoutes, communicationsRoutes);
  router.use('/reports', ...dataRoutes, reportsRoutes);
  router.use('/notifications', ...dataRoutes, notificationsRoutes);

  return router;
}
