import { Router } from 'express';
import { login, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { store } from '../data/store.js';
import clientRoutes from './clients.routes.js';
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
  router.get('/meta/stages', authenticate, (req, res) => res.json({ data: store.stages }));

  router.use('/clients', authenticate, clientRoutes);
  router.use('/transfers', authenticate, transferRoutes);
  router.use('/deals', authenticate, dealRoutes);
  router.use('/compliance', authenticate, complianceRoutes);
  router.use('/communications', authenticate, communicationsRoutes);
  router.use('/reports', authenticate, reportsRoutes);
  router.use('/notifications', authenticate, notificationsRoutes);

  return router;
}
